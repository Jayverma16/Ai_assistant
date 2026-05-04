import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getEmbedding(text: string): Promise<number[]> {
const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/pipeline/feature-extraction",  // ← new URL
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("HF_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    }
  );
  const result = await response.json();
  return Array.isArray(result[0]) ? result[0] : result;
}

Deno.serve(async (req) => {
  try {
    const { text, audio_url } = await req.json();

    const embedding = await getEmbedding(text);

    const { error } = await supabase
      .from("memories")
      .insert({ text, audio_url, embedding });

    if (error) return new Response(JSON.stringify({ error }), { status: 500 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});