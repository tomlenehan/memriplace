import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { ChatMessagePublic, ChatMessagesService } from '../client';

interface ChatState {
  conversationId: number | null;
  messages: ChatMessagePublic[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  fetchRequestId: string | null;
  currentStreamingMessageId: number | null;
  streamingMessageIds: number[];
}

const initialState: ChatState = {
  conversationId: null,
  messages: [],
  status: 'idle',
  error: null,
  fetchRequestId: null,
  currentStreamingMessageId: null,
  streamingMessageIds: [],
};

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (conversationId: number) => {
    const response = await ChatMessagesService.readChatMessages({ conversationId });
    return response.data;
  },
  {
    condition: (conversationId, { getState }) => {
      const activeConversationId = (getState() as { chat: ChatState }).chat.conversationId;
      return activeConversationId === null || activeConversationId === conversationId;
    },
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearMessages: (state, action: PayloadAction<number>) => {
      state.conversationId = action.payload;
      state.messages = [];
      state.status = 'idle';
      state.error = null;
      state.fetchRequestId = null;
      state.currentStreamingMessageId = null;
      state.streamingMessageIds = [];
    },
    addMessage: (state, action: PayloadAction<{ conversationId: number; message: ChatMessagePublic }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      if (!state.messages.some((message) => message.id === action.payload.message.id)) {
        state.messages.push(action.payload.message);
      }
    },
    startStreamingMessage: (state, action: PayloadAction<{ conversationId: number; id: number; sender_type?: string }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      if (state.messages.some((message) => message.id === action.payload.id)) return;
      const newMessage: ChatMessagePublic = {
        id: action.payload.id,
        timestamp: new Date().toISOString(),
        sender_type: (action.payload.sender_type as ChatMessagePublic['sender_type']) || 'ai',
        content: '',
      };
      state.messages.push(newMessage);
      state.currentStreamingMessageId = newMessage.id;
      if (!state.streamingMessageIds.includes(newMessage.id)) {
        state.streamingMessageIds.push(newMessage.id);
      }
    },
    addStreamingMessage: (state, action: PayloadAction<{ conversationId: number; id: number; content: string }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      if (action.payload.id) {
        const streamingMessage = state.messages.find(
          (msg) => msg.id === action.payload.id
        );

        if (streamingMessage) {
          streamingMessage.content += action.payload.content;
        }
      }
    },
    replaceStreamingMessage: (state, action: PayloadAction<{ conversationId: number; id: number; message: ChatMessagePublic }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      const index = state.messages.findIndex((msg) => msg.id === action.payload.id);
      const persistedIndex = state.messages.findIndex((msg) => msg.id === action.payload.message.id);
      if (index >= 0 && persistedIndex >= 0 && persistedIndex !== index) {
        state.messages[persistedIndex] = action.payload.message;
        state.messages.splice(index, 1);
      } else if (index >= 0) {
        state.messages[index] = action.payload.message;
      } else if (persistedIndex < 0) {
        state.messages.push(action.payload.message);
      }
      state.streamingMessageIds = state.streamingMessageIds.filter((id) => id !== action.payload.id);
      if (state.currentStreamingMessageId === action.payload.id) {
        state.currentStreamingMessageId = null;
      }
    },
    removeStreamingMessage: (state, action: PayloadAction<{ conversationId: number; id: number }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      state.messages = state.messages.filter((msg) => msg.id !== action.payload.id);
      state.streamingMessageIds = state.streamingMessageIds.filter((id) => id !== action.payload.id);
      if (state.currentStreamingMessageId === action.payload.id) {
        state.currentStreamingMessageId = null;
      }
    },
    endStreamingMessage: (state, action: PayloadAction<{ conversationId: number; id?: number }>) => {
      if (state.conversationId !== action.payload.conversationId) return;
      if (action.payload?.id !== undefined) {
        state.streamingMessageIds = state.streamingMessageIds.filter((id) => id !== action.payload?.id);
        if (state.currentStreamingMessageId === action.payload.id) {
          state.currentStreamingMessageId = null;
        }
      } else {
        state.streamingMessageIds = [];
        state.currentStreamingMessageId = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state, action) => {
        if (state.conversationId !== null && state.conversationId !== action.meta.arg) return;
        state.conversationId = action.meta.arg;
        state.fetchRequestId = action.meta.requestId;
        if (state.messages.length === 0) state.status = 'loading';
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        if (state.conversationId !== action.meta.arg || state.fetchRequestId !== action.meta.requestId) return;
        state.status = 'succeeded';
        state.messages = action.payload;
        state.fetchRequestId = null;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        if (state.conversationId !== action.meta.arg || state.fetchRequestId !== action.meta.requestId) return;
        state.status = state.messages.length === 0 ? 'failed' : 'succeeded';
        state.error = action.error.message || null;
        state.fetchRequestId = null;
      });
  },
});

export const {
  clearMessages,
  addMessage,
  startStreamingMessage,
  addStreamingMessage,
  replaceStreamingMessage,
  removeStreamingMessage,
  endStreamingMessage,
} = chatSlice.actions;

export default chatSlice.reducer;
