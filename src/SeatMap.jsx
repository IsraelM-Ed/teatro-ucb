import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    getReservationState,
    getSeatRows,
    RESERVATION_EVENT,
    toggleSeat
} from './reservation-store.js';

function SeatMap() {
    const [state, setState] = useState(getReservationState);
    const [previewSeat, setPreviewSeat] = useState(null);
    const rows = getSeatRows();
    const occupied = new Set(state.occupiedSeats);
    const selected = new Set(state.selectedSeats);

    useEffect(() => {
        const update = event => setState(event.detail);
        document.addEventListener(RESERVATION_EVENT, update);
        return () => document.removeEventListener(RESERVATION_EVENT, update);
    }, []);

    return (
        <div role="group" aria-label="Mapa de butacas" aria-busy={state.loading}>
            {state.loading && (
                <>
                    <p className="mapa-loading" role="status">Cargando butacas...</p>
                    <div className="mapa-skeleton" aria-hidden="true">
                        {rows.map(row => (
                            <div className="fila fila-skeleton" key={row.label}>
                                <span className="skeleton fila-skeleton-label"></span>
                                {row.seats.map(code => <span className="skeleton asiento-skeleton" key={code}></span>)}
                            </div>
                        ))}
                    </div>
                </>
            )}
            {!state.loading && rows.map((row, rowIndex) => (
                <div className={`fila fila-${row.label.toLowerCase()}`} key={row.label} role="group" aria-label={`Fila ${row.label}`}>
                    <span>{row.label}</span>
                    {row.seats.map((code, seatIndex) => {
                        const isOccupied = occupied.has(code);
                        return (
                            <button
                                className={`asiento${isOccupied ? ' ocupado' : ''}`}
                                key={code}
                                type="button"
                                aria-label={`Butaca ${code}${isOccupied ? ', ocupada' : ''}`}
                                title={`Butaca ${code}${isOccupied ? ' · Ocupada' : ''}`}
                                aria-pressed={selected.has(code)}
                                data-curva={seatIndex}
                                data-pasillo={seatIndex === 4 ? 'despues' : undefined}
                                disabled={!state.currentFunction || state.loading || state.loadError || state.confirming || isOccupied}
                                onMouseEnter={() => setPreviewSeat({ code, row: rowIndex, column: seatIndex })}
                                onMouseLeave={() => setPreviewSeat(null)}
                                onFocus={() => setPreviewSeat({ code, row: rowIndex, column: seatIndex })}
                                onBlur={() => setPreviewSeat(null)}
                                onClick={() => toggleSeat(code)}
                            >
                                {isOccupied ? '×' : code.slice(1)}
                            </button>
                        );
                    })}
                </div>
            ))}
            {previewSeat && (
                <aside
                    className={`vista-butaca vista-${previewSeat.column < 3 ? 'izquierda' : previewSeat.column > 6 ? 'derecha' : 'centro'} vista-fila-${previewSeat.row < 2 ? 'cerca' : previewSeat.row > 3 ? 'lejos' : 'media'}`}
                    role="status"
                    aria-label={`Vista aproximada del escenario desde la butaca ${previewSeat.code}`}
                >
                    <p>Vista aproximada desde la butaca <strong>{previewSeat.code}</strong></p>
                    <div className="vista-escenario-marco" aria-hidden="true">
                        <div className="vista-escenario-mini">Escenario</div>
                    </div>
                    <small>Representación orientativa, no fotografía real.</small>
                </aside>
            )}
        </div>
    );
}

createRoot(document.getElementById('mapa')).render(<SeatMap />);
