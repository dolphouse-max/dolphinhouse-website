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
    
    // Simple keyword search in text field
    const searchTerms = message.toLowerCase().split(' ').filter(word => word.length > 3);
    const searchQuery = searchTerms.length > 0 
      ? `%${searchTerms[0]}%` 
      : '%room%';
    
    const { results } = await db.prepare(`
      SELECT text, source, ref
      FROM knowledge_chunks
      WHERE LOWER(text) LIKE ?
      LIMIT 3
    `).bind(searchQuery).all();

    console.log(`✅ Found ${results.length} relevant chunks`);

    // Step 2: Build context from retrieved chunks
    const context = results.length > 0 
      ? results.map(r => r.text).join("\n\n")
      : "No specific knowledge found in database.";

    // Step 4: Call OpenAI Chat API
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
            content: `You are a helpful assistant for Dolphin House Beach Resort in Nagaon, Alibaug. 
Use the following context to answer questions accurately and concisely:

${context}

If the context doesn't contain relevant information, politely say you don't have that specific information and suggest contacting the resort directly at +91-8554871073 or visiting the booking page.`
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
      sources: results.map(r => ({ source: r.source, ref: r.ref }))
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