import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/pipeline/feature-extraction",
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
  const embedding = Array.isArray(result[0]) ? result[0] : Array.from(result);
  console.log("Embedding length:", embedding.length);  // debug
  return embedding;
}

Deno.serve(async (req) => {
  try {
    const { query, match_count = 5 } = await req.json();
    console.log("Query:", query);  // debug

    const embedding = await getEmbedding(query);

    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_count: match_count
    });

    console.log("DB data:", JSON.stringify(data));  // debug
    console.log("DB error:", JSON.stringify(error));  // debug

    if (error) return new Response(JSON.stringify({ error }), { status: 500 });
    return new Response(JSON.stringify({ results: data }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});