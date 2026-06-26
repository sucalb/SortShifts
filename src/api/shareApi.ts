import type { ShareInfo, StaffMember } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { SlotOverrides } from '../utils/slotAccess';

export interface SharedScheduleData {
  shareId: string;
  weekStart: string;
  shifts: import('../types').Shift[];
  roster: TeachingAssistant[];
  slotOverrides?: SlotOverrides;
  staff: StaffMember[];
  updatedAt?: string;
}

export interface ShareCreatePayload {
  weekStart: string;
  shifts: import('../types').Shift[];
  roster: TeachingAssistant[];
  slotOverrides?: SlotOverrides;
  staff: StaffMember[];
}

const API_BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Lỗi kết nối server');
  }
  return res.json() as Promise<T>;
}

export function getGuestUrl(shareId: string): string {
  return `${window.location.origin}/dang-ky/${shareId}`;
}

export async function createShare(payload: ShareCreatePayload): Promise<ShareInfo> {
  const result = await request<{ shareId: string; adminToken: string; guestUrl: string }>(
    '/api/share',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return {
    shareId: result.shareId,
    adminToken: result.adminToken,
    guestUrl: getGuestUrl(result.shareId),
  };
}

export async function fetchShare(shareId: string): Promise<SharedScheduleData> {
  return request<SharedScheduleData>(`/api/share/${shareId}`);
}

export async function updateShare(
  shareId: string,
  adminToken: string,
  payload: ShareCreatePayload,
): Promise<SharedScheduleData> {
  return request<SharedScheduleData>(`/api/share/${shareId}`, {
    method: 'PUT',
    headers: { 'x-admin-token': adminToken },
    body: JSON.stringify(payload),
  });
}

export async function registerGuest(
  shareId: string,
  fullName: string,
  abbreviation?: string,
): Promise<StaffMember> {
  const result = await request<{ staff: StaffMember }>(`/api/share/${shareId}/register`, {
    method: 'POST',
    body: JSON.stringify({ fullName, abbreviation }),
  });
  return result.staff;
}

export async function updateGuestAvailability(
  shareId: string,
  staffId: string,
  availability: StaffMember['availability'],
): Promise<StaffMember> {
  const result = await request<{ staff: StaffMember }>(
    `/api/share/${shareId}/staff/${staffId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ availability }),
    },
  );
  return result.staff;
}
