import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../components/ui/Card';
import { RefreshCw, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

export const BookingPaymentConfirm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'rejected'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const preferenceId = searchParams.get('preference_id');
  const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
  const paymentStatus = searchParams.get('payment_status') || searchParams.get('status') || searchParams.get('collection_status');

  useEffect(() => {
    let isMounted = true;

    async function processConfirmation() {
      if (!preferenceId || !paymentId) {
        if (isMounted) {
          setStatus('error');
          setErrorMsg('Información de pago incompleta. Redirigiéndote al inicio...');
          setTimeout(() => navigate('/'), 5000);
        }
        return;
      }

      if (paymentStatus !== 'success' && paymentStatus !== 'approved') {
        if (isMounted) {
          setStatus('rejected');
          setErrorMsg('El pago no fue aprobado o fue cancelado. Redirigiéndote para intentar nuevamente...');
          setTimeout(() => navigate('/'), 5000);
        }
        return;
      }

      const pollStatus = async (retries = 0) => {
        if (!isMounted) return;

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const waApiKey = import.meta.env.VITE_WA_API_KEY;
          if (waApiKey) headers['x-api-key'] = waApiKey;

          const response = await fetch('/api/payment/confirm_payment', {
            method: 'POST',
            headers,
            body: JSON.stringify({ preferenceId, paymentId }),
          });

          const data = await response.json();

          if (response.ok && data.success) {
            setStatus('success');
            // Redirigir a la vista de turno
            setTimeout(() => {
              navigate(`/turno/${data.bookingId}?payment_status=success&payment_id=${paymentId}`);
            }, 1500);
          } else if (data.error === 'pending') {
            // El webhook aún no ha insertado el turno. Seguir haciendo polling (hasta 15 intentos = 30 segs)
            if (retries < 15) {
              setTimeout(() => pollStatus(retries + 1), 2000);
            } else {
              setStatus('error');
              setErrorMsg('Demora en el procesamiento. Tu turno se guardará en breve y recibirás un correo.');
            }
          } else {
            throw new Error(data.error || 'Ocurrió un error al confirmar la reserva.');
          }
        } catch (err: any) {
          console.error('Error polling payment status:', err);
          if (retries < 5) {
            setTimeout(() => pollStatus(retries + 1), 2000);
          } else {
            setStatus('error');
            setErrorMsg(err.message || 'Error de conexión.');
          }
        }
      };

      pollStatus();
    }

    processConfirmation();

    return () => {
      isMounted = false;
    };
  }, [preferenceId, paymentId, paymentStatus, navigate]);

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <Card className="border border-neutral-100 shadow-xl rounded-3xl overflow-hidden">
        <CardContent className="p-8 text-center space-y-6">
          {status === 'loading' && (
            <div className="space-y-4 py-6">
              <div className="flex justify-center">
                <RefreshCw className="h-12 w-12 text-primary animate-spin" />
              </div>
              <h2 className="text-xl font-extrabold text-offblack">Procesando Pago</h2>
              <p className="text-gray-400 font-semibold text-sm leading-relaxed">
                Estamos registrando tu pago en Mercado Pago y confirmando tu turno en la agenda. No cierres esta ventana.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4 py-6">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-success animate-bounce" />
              </div>
              <h2 className="text-xl font-extrabold text-offblack">¡Pago Confirmado!</h2>
              <p className="text-gray-400 font-semibold text-sm leading-relaxed">
                Tu turno ha sido registrado correctamente en la agenda. Redirigiéndote a los detalles...
              </p>
            </div>
          )}

          {status === 'rejected' && (
            <div className="space-y-4 py-6">
              <div className="flex justify-center">
                <AlertTriangle className="h-16 w-16 text-warning" />
              </div>
              <h2 className="text-xl font-extrabold text-offblack">Pago no Aprobado</h2>
              <p className="text-danger font-semibold text-sm leading-relaxed">
                {errorMsg}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-6">
              <div className="flex justify-center">
                <AlertTriangle className="h-16 w-16 text-danger animate-pulse" />
              </div>
              <h2 className="text-xl font-extrabold text-offblack">Error de Procesamiento</h2>
              <p className="text-gray-400 font-semibold text-sm leading-relaxed">
                {errorMsg}
              </p>
              <div className="text-xs text-gray-400 border border-neutral-100 bg-neutral-50 p-3.5 rounded-xl text-left flex gap-2">
                <HelpCircle className="h-5 w-5 shrink-0 text-gray-400" />
                <span>Si el pago se debitó de tu cuenta pero sigues viendo este error, no te preocupes, el turno se procesará automáticamente y te llegará por WhatsApp y Email.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
