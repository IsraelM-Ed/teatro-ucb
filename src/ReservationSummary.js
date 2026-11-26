import '@angular/compiler';
import 'zone.js';
import { ChangeDetectorRef, Component, inject, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import {
    cancelarPagoSimulado,
    cerrarPagoConfirmado,
    confirmReservation,
    getReservationState,
    reenviarCorreoConfirmacion,
    RESERVATION_EVENT
} from './reservation-store.js';

class ReservationSummaryComponent {
    constructor() {
        this.changeDetector = inject(ChangeDetectorRef);
        this.state = getReservationState();
        this.loginUrl = new URL('login.html', document.baseURI).href;
        this.updateState = event => {
            this.state = event.detail;
            this.changeDetector.detectChanges();
        };
        document.addEventListener(RESERVATION_EVENT, this.updateState);
    }

    confirm() {
        return confirmReservation();
    }

    cancelPayment() {
        cancelarPagoSimulado();
    }

    retryEmail() {
        return reenviarCorreoConfirmacion();
    }

    finishPayment() {
        cerrarPagoConfirmado();
    }
}

Component({
    selector: 'app-reservation-summary',
    standalone: false,
    template: `
        <div class="resumen" aria-live="polite">
            <p>Butacas: <strong>{{ state.selectedSeats.length ? state.selectedSeats.join(', ') : 'ninguna' }}</strong></p>
            <p>Total: <strong>Bs {{ state.total }}</strong></p>
            <p class="reserva-bloqueo" [hidden]="!state.selectedSeats.length">
                Butacas bloqueadas temporalmente:
                <strong>{{ state.holdSecondsRemaining }} s</strong>
                <span [hidden]="!state.holdUpdating"> · Actualizando selección…</span>
            </p>
        </div>

        <a class="reserva-login" [hidden]="!state.loginRequired" [href]="loginUrl">
            Inicia sesión para continuar con la reserva
        </a>

        <button class="btn"
                type="button"
                [hidden]="state.paymentStatus !== 'idle'"
                [disabled]="!state.selectedSeats.length || state.loading || state.loadError || state.confirming || state.holdUpdating || !state.holdSecondsRemaining"
                (click)="confirm()">
            {{ state.confirming ? 'Preparando QR…' : 'Continuar al pago QR' }}
        </button>

        <section class="resumen-pago" [hidden]="state.paymentStatus !== 'processing'" aria-live="polite">
            <h3>Pago QR de demostración</h3>
            <p>Este QR es simulado: no transfiere dinero ni se conecta a una entidad financiera.</p>
            <img class="resumen-pago-qr"
                 [hidden]="!state.paymentQr"
                 [src]="state.paymentQr"
                 alt="Código QR de demostración, sin valor de pago real">
            <p [hidden]="!state.paymentQr">Pago de prueba en {{ state.paymentSecondsRemaining }} s…</p>
            <p [hidden]="state.paymentQr">Preparando el QR de demostración…</p>
            <button class="btn btn-borde" type="button" [disabled]="state.confirming" (click)="cancelPayment()">
                Cancelar pago
            </button>
        </section>

        <section class="resumen-pago resumen-pago-confirmado"
                 [hidden]="state.paymentStatus !== 'confirmed'"
                 aria-live="polite">
            <h3>Pago confirmado</h3>
            <p>La simulación finalizó correctamente. No se realizó ningún cobro real.</p>
            <p [hidden]="state.emailStatus !== 'sending'">Enviando el correo de confirmación…</p>
            <p [hidden]="state.emailStatus !== 'sent'">El correo de confirmación fue enviado.</p>
            <div [hidden]="state.emailStatus !== 'error'">
                <p class="resumen-pago-error" role="alert">
                    No se pudo enviar el correo: {{ state.emailError }}
                </p>
                <button class="btn btn-borde"
                        type="button"
                        [disabled]="state.emailStatus === 'sending'"
                        (click)="retryEmail()">
                    Reintentar envío
                </button>
            </div>
            <button class="btn btn-borde"
                    type="button"
                    [disabled]="state.emailStatus === 'sending'"
                    (click)="finishPayment()">
                Listo
            </button>
        </section>
    `
})(ReservationSummaryComponent);

class ReservationSummaryModule {}

NgModule({
    imports: [BrowserModule],
    declarations: [ReservationSummaryComponent],
    bootstrap: [ReservationSummaryComponent]
})(ReservationSummaryModule);

platformBrowserDynamic()
    .bootstrapModule(ReservationSummaryModule)
    .catch(error => {
        console.error('No se pudo iniciar el resumen Angular de la reserva.', error);
        const root = document.querySelector('app-reservation-summary');
        if (root) root.textContent = 'No se pudo cargar el resumen de la reserva.';
    });
