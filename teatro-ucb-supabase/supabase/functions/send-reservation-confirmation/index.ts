import { createClient } from 'npm:@supabase/supabase-js@2';
import QRCode from 'npm:qrcode@1.5.4';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}

function escapeHtml(value: string) {
    const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return value.replace(/[&<>"']/g, character => entities[character]);
}

function parseLaPazDate(value: string) {
    const isoValue = value.replace(' ', 'T');
    const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoValue)
        ? isoValue
        : `${isoValue}-04:00`;
    const date = new Date(withTimezone);
    if (Number.isNaN(date.getTime())) throw new Error('La fecha de la función no es válida.');
    return date;
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return jsonResponse({ error: 'Debes iniciar sesión para enviar el correo.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM');
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !resendFrom) {
        console.error('Falta configurar Supabase o Resend en los secretos de la función.');
        return jsonResponse({ error: 'El servicio de correo no está configurado.' }, 503);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        const token = authorization.slice('Bearer '.length);
        const { data: userData, error: authError } = await serviceClient.auth.getUser(token);
        const user = userData.user;
        if (authError || !user?.email) {
            return jsonResponse({ error: 'La sesión no es válida o no tiene correo asociado.' }, 401);
        }

        let body: { reservation_ids?: unknown };
        try {
            body = await request.json();
        } catch {
            return jsonResponse({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400);
        }

        const rawIds = body.reservation_ids;
        if (
            !Array.isArray(rawIds)
            || rawIds.length === 0
            || rawIds.length > 60
            || rawIds.some(id => typeof id !== 'string' || !/^\d+$/.test(id))
        ) {
            return jsonResponse({ error: 'La lista de reservas no es válida.' }, 400);
        }
        const reservationIds = [...new Set(rawIds)];
        if (reservationIds.length !== rawIds.length) {
            return jsonResponse({ error: 'La lista de reservas contiene duplicados.' }, 400);
        }

        const { data: reservations, error: reservationError } = await serviceClient
            .from('reservas')
            .select('id, user_id, funcion_id, butaca, ticket_token, estado, pago_metodo, pago_referencia, pago_confirmado_en')
            .in('id', reservationIds)
            .eq('user_id', user.id)
            .eq('estado', 'confirmada');
        if (reservationError) {
            console.error('No se pudieron consultar las reservas para el correo.', reservationError.message);
            return jsonResponse({ error: 'No se pudieron validar las reservas.' }, 500);
        }
        if (!reservations || reservations.length !== reservationIds.length) {
            return jsonResponse({ error: 'No se encontraron todas las reservas confirmadas de esta cuenta.' }, 404);
        }
        if (reservations.some(reservation =>
            reservation.pago_metodo !== 'qr_simple_simulado'
            || !reservation.pago_referencia
            || !reservation.pago_confirmado_en
        )) {
            return jsonResponse({ error: 'Las reservas no tienen un pago simulado confirmado.' }, 400);
        }
        const references = new Set(reservations.map(reservation => reservation.pago_referencia));
        const functionIds = new Set(reservations.map(reservation => reservation.funcion_id));
        if (references.size !== 1 || functionIds.size !== 1) {
            return jsonResponse({ error: 'Las reservas deben pertenecer a un mismo pago y función.' }, 400);
        }

        const { data: funcion, error: functionError } = await serviceClient
            .from('funciones')
            .select('id, inicio, obra_id')
            .eq('id', reservations[0].funcion_id)
            .single();
        if (functionError || !funcion) {
            console.error('No se pudo consultar la función del correo.', functionError?.message);
            return jsonResponse({ error: 'No se pudo obtener la información de la función.' }, 500);
        }

        const { data: obra, error: workError } = await serviceClient
            .from('obras')
            .select('titulo')
            .eq('id', funcion.obra_id)
            .single();
        if (workError || !obra) {
            console.error('No se pudo consultar la obra del correo.', workError?.message);
            return jsonResponse({ error: 'No se pudo obtener la información de la obra.' }, 500);
        }

        const formattedDate = new Intl.DateTimeFormat('es-BO', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'America/La_Paz'
        }).format(parseLaPazDate(funcion.inicio));
        const safeTitle = escapeHtml(obra.titulo);
        const safeDate = escapeHtml(formattedDate);
        const attachments = [];
        const ticketRows = [];

        for (const reservation of reservations) {
            const qrDataUrl = await QRCode.toDataURL(reservation.ticket_token, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 220,
                color: { dark: '#171112', light: '#ffffff' }
            });
            const contentId = `entrada-${reservation.ticket_token}`;
            attachments.push({
                filename: `entrada-${reservation.butaca}.png`,
                content: qrDataUrl.split(',')[1],
                content_id: contentId
            });
            ticketRows.push(`
                <li style="margin: 0 0 24px;">
                    <strong>Butaca ${escapeHtml(reservation.butaca)}</strong><br>
                    <img src="cid:${contentId}" width="180" height="180"
                         alt="QR de entrada para butaca ${escapeHtml(reservation.butaca)}">
                </li>
            `);
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: resendFrom,
                to: [user.email],
                subject: `Entradas confirmadas: ${obra.titulo}`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #171112; line-height: 1.5;">
                        <h1>Tu reserva en Teatro UCB está confirmada</h1>
                        <p><strong>Obra:</strong> ${safeTitle}</p>
                        <p><strong>Función:</strong> ${safeDate}</p>
                        <p>Presenta el código QR correspondiente a cada butaca al ingresar.</p>
                        <ul style="padding-left: 20px;">${ticketRows.join('')}</ul>
                        <p>Este correo confirma una compra de demostración; el sitio no procesó un cobro real.</p>
                    </div>
                `,
                attachments
            })
        });

        if (!emailResponse.ok) {
            console.error('Resend rechazó el correo de confirmación.', emailResponse.status);
            return jsonResponse({ error: 'El proveedor de correo no aceptó el mensaje.' }, 502);
        }

        return jsonResponse({ sent: true });
    } catch (error) {
        console.error('Falló el envío del correo de confirmación.', error);
        return jsonResponse({
            error: error instanceof Error ? error.message : 'No se pudo enviar el correo de confirmación.'
        }, 500);
    }
});
