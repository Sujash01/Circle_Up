import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CartUiState {
  isDrawerOpen: boolean;
  guestCartId: string | null;
}

const initialState: CartUiState = {
  isDrawerOpen: false,
  guestCartId: null,
};

const cartUiSlice = createSlice({
  name: 'cartUi',
  initialState,
  reducers: {
    openCartDrawer(state) {
      state.isDrawerOpen = true;
    },
    closeCartDrawer(state) {
      state.isDrawerOpen = false;
    },
    setGuestCartId(state, action: PayloadAction<string | null>) {
      state.guestCartId = action.payload;
    },
  },
});

export const { openCartDrawer, closeCartDrawer, setGuestCartId } = cartUiSlice.actions;
export default cartUiSlice.reducer;

