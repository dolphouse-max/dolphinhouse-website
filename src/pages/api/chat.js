// src/pages/api/chat.js
export async function POST({ locals, request }) {
  const db = locals.runtime.env.DB;
  const OPENAI_API_KEY = locals.runtime.env.OPENAI_API_KEY;
  
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

    if (!OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not found in environment');
      return new Response(JSON.stringify({ 
        error: "OpenAI API key not configured" 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
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
    
    // Search for any matching keyword
    let results = [];
    
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        const { results: matches } = await db.prepare(`
          SELECT text, source, ref
          FROM knowledge_chunks
          WHERE LOWER(text) LIKE ? OR LOWER(source) LIKE ? OR LOWER(ref) LIKE ?
          LIMIT 5
        `).bind(`%${term}%`, `%${term}%`, `%${term}%`).all();
        
        results.push(...matches);
      }
    }
    
    // Remove duplicates and limit to 3
    const uniqueResults = [...new Map(results.map(r => [r.ref, r])).values()].slice(0, 3);

    console.log(`✅ Found ${uniqueResults.length} relevant chunks`);

    // Step 2: Build context from retrieved chunks
    const context = uniqueResults.length > 0 
      ? uniqueResults.map(r => r.text).join("\n\n")
      : "No specific knowledge found in database.";

    // Step 3: Call OpenAI Chat API
    console.log('💬 Calling OpenAI Chat...');
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a helpful and expert assistant for Dolphin House Beach Resort in Nagaon, Alibaug. 
            Use the following context to answer questions accurately:

            ${context}

            ---
            **IMPORTANT RULES:**
            1.  **If the user asks for directions from a specific location** (like "Andheri", "Bandra", "Pune", etc.), and the context contains general 'how-to-reach' or 'address' information, **that context IS RELEVANT.**
            2.  In this case, provide the general directions (like Ferry, Car, Train) and **always provide the Google Maps link**, as that is the best answer for their specific starting point.
            3.  If the context doesn't contain relevant information to the question, *then* you can say you don't have that specific information and suggest contacting the resort at +91-8554871073 or visiting the booking page.
            ---`
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!chatRes.ok) {
      const error = await chatRes.text();
      console.error('❌ Chat API error:', error);
      throw new Error('Failed to get chat response');
    }

    const chatData = await chatRes.json();
    const reply = chatData.choices[0].message.content;
    console.log('✅ Chat response generated');

    return new Response(JSON.stringify({ 
      reply,
      sources: uniqueResults.map(r => ({ source: r.source, ref: r.ref }))
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("❌ Chat error:", err);
    return new Response(JSON.stringify({ 
      error: "Failed to process your message. Please try again.",
      details: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}