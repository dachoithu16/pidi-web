export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. Kiểm tra API Key của SePay (nếu đã cài biến SEPAY_API_KEY trên Cloudflare)
    const authHeader = request.headers.get('Authorization') || '';
    if (env.SEPAY_API_KEY && authHeader !== `Apikey ${env.SEPAY_API_KEY}`) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();

    // 2. Chỉ xử lý giao dịch tiền vào
    if (body.transferType && body.transferType !== 'in') {
      return new Response(JSON.stringify({ success: true, message: 'Ignored outgoing transfer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Tách mã đơn hàng định dạng DPA + 8 ký tự
    const rawText = `${body.code || ''} ${body.content || ''} ${body.description || ''}`.toUpperCase();
    const match = rawText.match(/(?:SEVQR\s*|\b)(DPA[A-Z0-9]{8})(?![A-Z0-9])/);
    const orderCode = match ? match[1] : null;

    if (!orderCode) {
      return new Response(JSON.stringify({ success: true, message: 'No matching DPA order code' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const paidAmount = Number(body.transferAmount) || 0;
    const txId = String(body.id || body.referenceCode || Date.now());

    // 4. Gọi RPC activate_vip_order lên Supabase bằng service_role key
    const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/activate_vip_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        p_order_code: orderCode,
        p_paid_amount: paidAmount,
        p_gateway_tx_id: txId
      })
    });

    const rpcData = await rpcRes.json();

    return new Response(JSON.stringify({ success: true, orderCode, rpcData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
