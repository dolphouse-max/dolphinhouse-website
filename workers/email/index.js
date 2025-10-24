// Cloudflare Email Worker: responds to inbound emails using Workers AI and D1.
export default {
  async email(message, env, ctx) {
    try {
      const from = message.from;
      const to = message.to;
      const subject = message.subject || '';
      const raw = await message.raw.text();
      const bodyText = raw || '';

      // Headers (may be undefined depending on provider)
      let messageId = null;
      let inReplyTo = null;
      try {
        messageId = message.headers?.get('Message-ID') || null;
        inReplyTo = message.headers?.get('In-Reply-To') || null;
      } catch {}

      // Ensure emails table exists
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            direction TEXT,
            from_addr TEXT,
            to_addr TEXT,
            subject TEXT,
            body TEXT,
            message_id TEXT,
            in_reply_to TEXT,
            thread_key TEXT,
            created_at TEXT
          )
        `).run();
      } catch (e) {
        // ignore if table creation fails in dev
        console.warn('emails table create warning:', e?.message || e);
      }

      const threadKey = subject.trim().replace(/^((re|fwd):\s*)+/i, '').toLowerCase();
      const now = new Date().toISOString();

      // Log inbound email
      try {
        await env.DB.prepare(`
          INSERT INTO emails (id, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, thread_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          'inbound',
          from,
          to,
          subject,
          bodyText,
          messageId,
          inReplyTo,
          threadKey,
          now
        ).run();
      } catch (e) {
        console.warn('inbound email log warning:', e?.message || e);
      }

      // Forward inbound email to backup mailbox
      try {
        const backup = env.BACKUP_EMAIL;
        if (backup) {
          const fwdPayload = {
            personalizations: [{ to: [{ email: backup }] }],
            from: { email: to },
            subject: `[FWD] ${subject}`,
            content: [{ type: 'text/plain', value: bodyText }]
          };
          const fwdResp = await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fwdPayload)
          });
          if (!fwdResp.ok) {
            console.error('MailChannels forward failed:', await fwdResp.text());
          }
          // Log forward as outbound copy
          await env.DB.prepare(`
            INSERT INTO emails (id, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, thread_key, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            crypto.randomUUID(),
            'outbound',
            to,
            backup,
            `[FWD] ${subject}`,
            bodyText,
            null,
            messageId || null,
            threadKey,
            new Date().toISOString()
          ).run();
        }
      } catch (e) {
        console.warn('forward log warning:', e?.message || e);
      }

      // Fetch context from D1 knowledge base (simple LIKE match)
      let kbSnippet = '';
      try {
        const term = subject.trim() || bodyText.slice(0, 120);
        const sql = `SELECT content FROM knowledge WHERE content LIKE ? ORDER BY updated_at DESC LIMIT 1`;
        const res = await env.DB.prepare(sql).bind(`%${term}%`).all();
        kbSnippet = res.results?.[0]?.content || '';
      } catch (e) {
        // ignore if table not present
      }

      // Generate response with Workers AI
      const prompt = `You are a helpful hotel assistant for Dolphin House, Alibaug.\n\nUser email:\n${bodyText}\n\nRelevant context:\n${kbSnippet}\n\nCompose a clear, friendly reply. If uncertain, ask a clarifying question.`;
      const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { prompt });
      const replyText = aiRes?.response || 'Thank you for reaching out. We will get back to you shortly.';

      // Send reply via MailChannels
      const sendPayload = {
        personalizations: [{ to: [{ email: from }] }],
        from: { email: to },
        subject: `Re: ${subject}`,
        content: [{ type: 'text/plain', value: replyText }]
      };
      const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sendPayload)
      });

      if (!resp.ok) {
        console.error('MailChannels send failed:', await resp.text());
      }

      // Log outbound email
      try {
        await env.DB.prepare(`
          INSERT INTO emails (id, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, thread_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          'outbound',
          to,
          from,
          `Re: ${subject}`,
          replyText,
          null,
          messageId || null,
          threadKey,
          new Date().toISOString()
        ).run();
      } catch (e) {
        console.warn('outbound email log warning:', e?.message || e);
      }
    } catch (err) {
      console.error('Email worker error:', err);
    }
  }
};