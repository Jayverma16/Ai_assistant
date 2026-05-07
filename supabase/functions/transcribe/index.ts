import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  try {
    const incoming = await req.formData();

    const file = incoming.get("file");

    if (!file) {
      return Response.json(
        {
          error: "No file uploaded",
        },
        {
          status: 400,
        }
      );
    }

    // Create new form data for Groq

    const formData = new FormData();

    formData.append("file", file);

    formData.append(
      "model",
      "whisper-large-v3"
    );

    formData.append(
      "language",
      "en"
    );

    formData.append(
      "response_format",
      "json"
    );

    // Call Groq

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
        },

        body: formData,
      }
    );

    const data = await groqRes.json();

    console.log(data);

    return Response.json({
      text: data.text || "",
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

