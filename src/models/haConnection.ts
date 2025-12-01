// src/models/haConnection.ts
export type HaConnection = {
  id: number;
  baseUrl: string;
  haUsername: string;
  haPassword: string;
  longLivedToken: string;
  ownerId: number;
};
