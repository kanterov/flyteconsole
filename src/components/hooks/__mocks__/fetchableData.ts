import { State } from 'xstate';
import { FetchableData, FetchFn, fetchStates } from '../types';

export function createMockFetchable<T>(
    value: any,
    fetch: FetchFn<T, any>
): FetchableData<T> {
    return {
        fetch,
        value,
        debugName: '',
        lastError: null,
        state: State.from(fetchStates.IDLE)
    };
}

export function loadingFetchable<T>(
    value: any,
    fetch: FetchFn<T, any>
): FetchableData<T> {
    return {
        ...createMockFetchable(value, fetch),
        state: State.from(fetchStates.LOADING)
    };
}

export function loadedFetchable<T>(
    value: any,
    fetch: FetchFn<T, any>
): FetchableData<T> {
    return {
        ...createMockFetchable(value, fetch),
        state: State.from(fetchStates.LOADED)
    };
}
