import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ActorType, AdminPermission, Role } from '@circleup/shared';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  actorType: ActorType;
  role: Role;
  permissions: AdminPermission[];
  isEmailVerified?: boolean;
}

export interface AuthState {
  accessToken: string | null;
  user: SessionUser | null;
  isInitialized: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  isInitialized: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ accessToken: string; user: SessionUser }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.isInitialized = true;
    },
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    clearSession(state) {
      state.accessToken = null;
      state.user = null;
      state.isInitialized = true;
    },
    markAuthInitialized(state) {
      state.isInitialized = true;
    },
  },
});

export const { setCredentials, setAccessToken, clearSession, markAuthInitialized } =
  authSlice.actions;
export default authSlice.reducer;

