// src/pages/api/chat.js
import localKnowledge from '../../../data/knowledge.json';
export async function POST({ locals, request }) {
  const db = locals.runtime?.env?.DB;
  const cfAI = locals.runtime?.env?.AI; // Cloudflare Workers AI binding
  const OPENAI_API_KEY = locals.runtime?.env?.OPENAI_API_KEY;
  const GROQ_API_KEY = locals.runtime?.env?.GROQ_API_KEY;
  const USE_OPENAI = !!OPENAI_API_KEY;
  
  console.log('🤖 Chat API called');
  
  try {
    const { message } = await request.json();
    console.log('📝 User message:', message);
    
    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!USE_OPENAI) {
      console.warn('⚠️ OPENAI_API_KEY missing; chatbot will use fallback answers.');
    }

    // Step 1: Search for relevant knowledge chunks using text search
    console.log('📚 Searching knowledge base...');
    
    // Extract keywords and search multiple terms
    const searchTerms = message.toLowerCase()
      .replace(/[?!.,]/g, ' ')
      .split(' ')
      .filter(word => word.length > 3)
      .slice(0, 3); // Take first 3 meaningful words
    
    console.log('Search terms:', searchTerms);
    
    // Search for any matching keyword (DB if available; otherwise local JSON)
    let results = [];
    if (searchTerms.length > 0) {
      if (db) {
        for (const term of searchTerms) {
          try {
            const { results: matches } = await db.prepare(`
              SELECT text, source, ref
              FROM knowledge_chunks
              WHERE LOWER(text) LIKE ? OR LOWER(source) LIKE ? OR LOWER(ref) LIKE ?
              LIMIT 5
            `).bind(`%${term}%`, `%${term}%`, `%${term}%`).all();
            results.push(...matches);
          } catch (dbErr) {
            console.warn('⚠️ Knowledge search failed for term:', term, dbErr);
          }
        }
        // If DB returned no matches, fall back to bundled local knowledge
        if (results.length === 0) {
          console.warn('⚠️ No DB matches found; using bundled local knowledge.json fallback.');
          try {
            const localData = Array.isArray(localKnowledge) ? localKnowledge : [];
            const scored = [];
            for (const item of localData) {
              const text = (item.text || '').toLowerCase();
              const source = (item.source || '').toLowerCase();
              const ref = (item.ref || '').toLowerCase();
              let score = 0;
              for (const term of searchTerms) {
                if (text.includes(term)) score += 2;
                if (source.includes(term)) score += 1;
                if (ref.includes(term)) score += 1;
              }
              if (score > 0) {
                scored.push({ text: item.text, source: item.source || 'local', ref: item.ref || 'local', _score: score });
              }
            }
            scored.sort((a, b) => b._score - a._score);
            results.push(...scored.slice(0, 5).map(({ text, source, ref }) => ({ text, source, ref })));
          } catch (fsErr) {
            console.warn('⚠️ Failed to use local knowledge.json:', fsErr);
          }
        }
      } else {
        console.warn('⚠️ DB binding not available; using bundled local knowledge.json fallback.');
        try {
          const localData = Array.isArray(localKnowledge) ? localKnowledge : [];
          const scored = [];
          for (const item of localData) {
            const text = (item.text || '').toLowerCase();
            const source = (item.source || '').toLowerCase();
            const ref = (item.ref || '').toLowerCase();
            let score = 0;
            for (const term of searchTerms) {
              if (text.includes(term)) score += 2;
              if (source.includes(term)) score += 1;
              if (ref.includes(term)) score += 1;
            }
            if (score > 0) {
              scored.push({ text: item.text, source: item.source || 'local', ref: item.ref || 'local', _score: score });
            }
          }
          scored.sort((a, b) => b._score - a._score);
          results.push(...scored.slice(0, 5).map(({ text, source, ref }) => ({ text, source, ref })));
        } catch (fsErr) {
          console.warn('⚠️ Failed to use local knowledge.json:', fsErr);
        }
      }
    }
    
    // Remove duplicates and limit to 3
    const uniqueResults = [...new Map(results.map(r => [r.ref, r])).values()].slice(0, 3);

    console.log(`✅ Found ${uniqueResults.length} relevant chunks`);

    // Step 2: Build context from retrieved chunks
    const context = uniqueResults.length > 0 
      ? uniqueResults.map(r => r.text).join("\n\n")
      : "No specific knowledge found in database.";

    // Step 3: Answer using AI provider if available; otherwise use a helpful fallback
    let reply = '';

    const composeFriendlyReply = (qMessage, chunks) => {
      const q = String(qMessage || '').toLowerCase();
      const byRef = (ref) => chunks.find(r => String(r.ref || '').toLowerCase() === ref);
      const contains = (s) => q.includes(s);

      if (contains('beach')) {
        const beach = byRef('beach-distance') || chunks.find(r => String(r.text || '').toLowerCase().includes('minutes'));
        if (beach) {
          return "We’re about a 2 minutes’ walk from Nagaon Beach. We’re right on Nagaon Beach Road, so beach access is very close.";
        }
        return "We’re very close to Nagaon Beach — just a short walk from the resort.";
      }

      if (contains('amenities') || contains('facility') || contains('facilities')) {
        const amenities = byRef('amenities-list');
        if (amenities) {
          return "We offer AC rooms and cottages, attached bathrooms with geysers, satellite TV, free Wi‑Fi, generator backup, car parking, an in‑house restaurant, and an indoor swimming pool with a waterfall.";
        }
        return "We have comfortable rooms, Wi‑Fi, parking, a restaurant, and an indoor pool.";
      }

      if (contains('reach') || contains('direction') || contains('directions') || contains('how to get') || contains('how do i get')) {
        const travel = byRef('how-to-reach');
        if (travel) {
          return "From Mumbai, the scenic route is the ferry to Mandwa Jetty, then a 15 km drive to Nagaon. By road, you can drive via the Expressway. By train, the nearest station is Pen (35 km).";
        }
        return "You can reach us by ferry to Mandwa and a short drive, or by road from Mumbai/Pune.";
      }

      if (contains('pet') || contains('pets') || contains('dog') || contains('cat')) {
        const pets = byRef('pets-policy');
        if (pets) {
          return "We’re sorry, pets aren’t allowed at Dolphin House. This helps us maintain hygiene and ensures other guests’ comfort. If you have special circumstances, please call us and we’ll try to assist.";
        }
        return "We don’t allow pets, to keep hygiene standards and guest comfort high.";
      }

      // General friendly summary using the most relevant chunk
      const first = chunks[0];
      if (first && first.text) {
        return `Here’s a quick answer: ${first.text}`;
      }
      return 'Thanks for your question! I’ll help with specifics if you share a bit more.';
    };
    const isUsefulKnowledge = (q, chunks) => {
      try {
        if (!chunks || chunks.length === 0) return false;
        const stop = new Set(['the','a','an','and','or','to','for','of','in','on','at','is','are','was','were','be','it','this','that','with','from','by','as']);
        const tokens = q.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(t => t && !stop.has(t));
        if (tokens.length === 0) return false;
        const tokenSet = new Set(tokens);
        let overlapCount = 0;
        for (const ch of chunks) {
          const text = `${ch.title || ''} ${ch.text || ''}`.toLowerCase();
          const words = text.replace(/[^a-z0-9\s]/g,' ').split(/\s+/);
          const match = words.some(w => tokenSet.has(w));
          if (match) overlapCount += 1;
        }
        // Consider useful if at least 30% of chunks overlap, or 1+ for small sets
        return overlapCount >= Math.min(1, Math.ceil(chunks.length * 0.3));
      } catch (e) {
        return uniqueResults.length > 0; // conservative fallback
      }
    };

    const useResortExpertPrompt = isUsefulKnowledge(message, uniqueResults);

    const buildMessages = (useContext) => {
      if (useContext) {
        return [
          {
            role: "system",
            content: `You are a helpful and expert assistant for Dolphin House Beach Resort in Nagaon, Alibaug.
            Use the following context to answer questions accurately:

            ${context}

            ---
            Rules:
            - If the user asks for directions from a specific location, use general 'how to reach' info in context and include a Google Maps link if relevant.
            - Be concise, friendly, and specific to the resort.
            - If context lacks specifics, suggest contacting +91-8554871073 or visiting the booking page.
            ---`
          },
          { role: "user", content: message }
        ];
      }
      return [
        {
          role: "system",
          content: `You are a friendly travel assistant. Answer clearly and helpfully. If the question is about Dolphin House, mention it only when relevant.`
        },
        { role: "user", content: message }
      ];
    };

    const callWorkersAI = async (messages) => {
      try {
        const aiRes = await cfAI.run('@cf/meta/llama-3.1-8b-instruct', { messages, temperature: 0.7 });
        const text = typeof aiRes === 'string'
          ? aiRes
          : aiRes?.response || aiRes?.output_text || aiRes?.result || aiRes?.choices?.[0]?.message?.content;
        if (text) return text;
        throw new Error('No text in Workers AI response');
      } catch (e) {
        console.warn('⚠️ Workers AI failed:', e);
        return null;
      }
    };

    const callGroq = async (messages) => {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages,
            temperature: 0.7,
            max_tokens: 500
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      } catch (e) {
        console.warn('⚠️ Groq AI failed:', e);
        return null;
      }
    };

    const callOpenAI = async (messages) => {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.7, max_tokens: 500 })
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      } catch (e) {
        console.warn('⚠️ OpenAI chat failed:', e);
        return null;
      }
    };

    const messages = buildMessages(useResortExpertPrompt);

    // Provider priority: Workers AI → Groq → OpenAI → friendly fallback
    const genericNoAnswer = 'Thanks for your question! I don’t have a specific answer right now. Please call +91-8554871073 or visit our Booking page.';

    if (cfAI) {
      const text = await callWorkersAI(messages);
      if (text) {
        reply = text;
      } else if (GROQ_API_KEY) {
        const groqText = await callGroq(messages);
        reply = groqText || (useResortExpertPrompt ? composeFriendlyReply(message, uniqueResults) : genericNoAnswer);
      } else if (USE_OPENAI) {
        const openaiText = await callOpenAI(messages);
        reply = openaiText || (useResortExpertPrompt ? composeFriendlyReply(message, uniqueResults) : genericNoAnswer);
      } else {
        reply = useResortExpertPrompt ? composeFriendlyReply(message, uniqueResults) : genericNoAnswer;
      }
    } else if (GROQ_API_KEY) {
      const groqText = await callGroq(messages);
      reply = groqText || (useResortExpertPrompt ? composeFriendlyReply(message, uniqueResults) : genericNoAnswer);
    } else if (USE_OPENAI) {
      const openaiText = await callOpenAI(messages);
      reply = openaiText || (useResortExpertPrompt ? composeFriendlyReply(message, uniqueResults) : genericNoAnswer);
    } else {
      // No OpenAI key: provide a helpful fallback using available context
      if (uniqueResults.length > 0) {
        reply = composeFriendlyReply(message, uniqueResults);
      } else {
        reply = genericNoAnswer;
      }
    }

    const responseSources = useResortExpertPrompt ? uniqueResults.map(r => ({ source: r.source, ref: r.ref })) : [];

    return new Response(JSON.stringify({ 
      reply,
      sources: responseSources
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("❌ Chat error:", err);
    // As a last resort, avoid breaking the UX: provide a generic helpful reply
    return new Response(JSON.stringify({ 
      reply: "Thanks for your question! I’m unable to fetch an answer right now. Please call +91-8554871073 or visit our Booking page.",
      error: err.message
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}