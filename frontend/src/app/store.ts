import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import cartUiReducer from '../store/slices/cartUiSlice';
import uiReducer from '../store/slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cartUi: cartUiReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

