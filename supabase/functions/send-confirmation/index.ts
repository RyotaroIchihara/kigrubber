import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SESSION_LABELS: Record<string, string> = {
  "slot-1": "第1部（13:00〜17:00）",
  "slot-2": "第2部（19:00〜22:00）",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const {
    p_name, p_email, p_session,
    p_rental, p_rental_height, p_rental_weight,
    p_award_entry, p_award_handle,
  } = body as Record<string, unknown>;

  // Call submit_entry RPC
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc("submit_entry", {
    p_name, p_email, p_session,
    p_rental, p_rental_height, p_rental_weight,
    p_award_entry, p_award_handle,
  });

  if (error) {
    console.error("RPC error:", error);
    return json({ error: "送信に失敗しました" }, 500);
  }
  if (data?.error) {
    return json({ error: data.error }, 409);
  }

  // Send confirmation email via Resend
  const sessionLabel = SESSION_LABELS[p_session as string] ?? p_session;
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "INCARNATION PARTY <noreply@alt-fetish.com>",
      to: [p_email],
      subject: "【INCARNATION PARTY】参加申込を受け付けました",
      html: `
<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
  <h2 style="color: #8e1427;">INCARNATION PARTY 参加申込確認</h2>
  <p>${p_name} さん、お申し込みありがとうございます。</p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f5f5f5; font-weight: bold; width: 120px;">参加希望回</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${sessionLabel}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f5f5f5; font-weight: bold;">日程</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">2026年3月7日（土）</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f5f5f5; font-weight: bold;">参加費</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">¥5,000（当日現金払い）</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f5f5f5; font-weight: bold;">会場</td>
      <td style="padding: 8px 12px;">東小金井特設イベントスペース（詳細は後日ご連絡）</td>
    </tr>
  </table>
  <p style="font-size: 0.9em; color: #666;">
    このメールに心当たりがない場合や、ご不明な点は
    <a href="mailto:contact@alt-fetish.com">contact@alt-fetish.com</a> までご連絡ください。
  </p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 0.8em; color: #999;">ALT-FETISH / INCARNATION PARTY 運営事務局</p>
</div>
      `.trim(),
    }),
  });

  if (!emailRes.ok) {
    const errBody = await emailRes.text();
    console.error("Resend error:", errBody);
    // Entry is saved; just log the email failure
    return json({ success: true, email_sent: false });
  }

  return json({ success: true, email_sent: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
