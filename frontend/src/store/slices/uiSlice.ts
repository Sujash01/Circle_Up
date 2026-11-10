import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ToastNotice {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface UiState {
  toasts: ToastNotice[];
}

const initialState: UiState = {
  toasts: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    pushToast(state, action: PayloadAction<Omit<ToastNotice, 'id'>>) {
      state.toasts.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...action.payload,
      });
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
  },
});

export const { pushToast, dismissToast } = uiSlice.actions;
export default uiSlice.reducer;

