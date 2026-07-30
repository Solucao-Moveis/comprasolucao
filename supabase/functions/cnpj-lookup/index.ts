// Proxy de consulta de CNPJ — chama a BrasilAPI do lado do servidor.
// Motivo: a BrasilAPI aplica rate limit (429) e, quando isso acontece, a
// resposta de erro dela não inclui cabeçalho CORS — o navegador então
// reporta como "bloqueado por CORS" em vez do 429 real, o que impede o
// cliente de tratar/re-tentar corretamente (crítico pra importação em lote).
// Aqui, além de evitar esse problema, já tentamos de novo automaticamente
// se a BrasilAPI responder 429.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let cnpj = "";
  try {
    const body = await req.json();
    cnpj = String(body?.cnpj ?? "").replace(/\D/g, "");
  } catch {
    // corpo ausente/inválido — cnpj continua vazio, cai na validação abaixo
  }

  if (cnpj.length !== 14) {
    return new Response(JSON.stringify({ message: "CNPJ inválido — precisa ter 14 dígitos." }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let res: Response;
  let attempt = 0;
  do {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (res.status !== 429) break;
    attempt++;
    await new Promise((r) => setTimeout(r, 800 * attempt));
  } while (attempt < 3);

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
