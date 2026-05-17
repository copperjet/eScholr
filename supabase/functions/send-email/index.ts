import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface SendEmailRequest {
  emails: EmailPayload[];
}

// Resend API endpoint
const RESEND_API_URL = 'https://api.resend.com/emails';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Verify JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Parse request
  let body: SendEmailRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { emails } = body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return new Response(JSON.stringify({ error: 'No emails provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get Resend API key from secrets
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Resend not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Default from address
  const defaultFrom = Deno.env.get('EMAIL_FROM') || 'noreply@escholr.com';

  const results: Array<{ to: string; success: boolean; error?: string }> = [];

  // Send emails via Resend
  for (const email of emails) {
    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: email.from || defaultFrom,
          to: email.to,
          subject: email.subject,
          html: email.html,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        results.push({ to: email.to, success: false, error: err });
      } else {
        const data = await res.json();
        results.push({ to: email.to, success: true });
      }
    } catch (e: any) {
      results.push({ to: email.to, success: false, error: e.message });
    }
  }

  const allSuccess = results.every(r => r.success);

  return new Response(
    JSON.stringify({
      success: allSuccess,
      results,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    }),
    {
      status: allSuccess ? 200 : 207, // Multi-status if partial failures
      headers: { ...CORS, 'Content-Type': 'application/json' },
    }
  );
});
