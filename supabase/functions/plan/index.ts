import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  try {
    const { text, match_count = 5 } = await req.json();

    // 1. Search memories

  const searchRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/search`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,

        apikey:
          Deno.env.get("SUPABASE_ANON_KEY")!,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        query: text,
        match_count,
      }),
    }
  );


    const searchData = await searchRes.json();
    const memories = searchData.results || [];

    // 2. Build context
    const context =
      memories.length > 0
        ? memories
            .map(
              (m: any) =>
                `- ${m.text} (relevance: ${(m.similarity * 100).toFixed(0)}%)`
            )
            .join("\n")
        : "No relevant memories found.";

    // 3. Call Groq
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `
You are a smart personal assistant for Jay.
You help with planning, reminders, and summarization.
Be concise and actionable.
              `,
            },
            {
              role: "user",
              content: `
Past memories:
${context}

Current note:
${text}

Help me plan.
              `,
            },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      }
    );

    const groqData = await groqRes.json();

    return Response.json({
      answer: groqData.choices?.[0]?.message?.content || "",
      memories,
    });
  } catch (err) {
    return Response.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
});