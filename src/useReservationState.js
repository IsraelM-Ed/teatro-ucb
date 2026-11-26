import { useEffect, useState } from 'react';
import {
    getReservationState,
    subscribeReservationState
} from './reservation-store.js';

export function useReservationState() {
    const [state, setState] = useState(getReservationState);

    useEffect(() => {
        const unsubscribe = subscribeReservationState(setState);
        setState(getReservationState());
        return unsubscribe;
    }, []);

    return state;
}
