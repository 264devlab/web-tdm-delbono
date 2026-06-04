// Availability Engine for Petshop Booking System

import { supabase } from './supabase';

export interface BookingSlot {
  time: string; // "HH:MM:SS" or "HH:MM"
  available: boolean;
  reason?: string;
  remainingCapacity?: number;
}

// Convert time string to minutes since midnight (for easier arithmetic)
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Convert minutes since midnight back to time string HH:MM:SS
export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

export interface AvailabilityParams {
  serviceId: string;
  dateStr: string; // YYYY-MM-DD
  quantity?: number;
  excludeBookingId?: string;
}

export function computeSlotsForDay({
  service,
  dateStr,
  dayBlocks,
  dayHours,
  dayBookings,
  quantity = 1,
}: {
  service: any;
  dateStr: string;
  dayBlocks: any[];
  dayHours: any[];
  dayBookings: any[];
  quantity?: number;
}): BookingSlot[] {
  // Check if there is an all-day block
  const allDayBlock = dayBlocks.find((b: any) => !b.start_time || b.start_time === '');
  if (allDayBlock) {
    return []; // Closed full day
  }

  // Ensure hours are fallback default shifts if none are provided
  let hours = dayHours;
  if (!hours || hours.length === 0) {
    hours = [
      { start_time: '09:00:00', end_time: '13:00:00' },
      { start_time: '16:00:00', end_time: '20:00:00' }
    ];
  }

  const duration = service.estimated_duration_minutes;
  const step = duration > 0 ? duration : 30;
  const slots: BookingSlot[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const isToday = todayStr === dateStr;
  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

  for (const shift of hours) {
    const shiftStart = timeToMinutes(shift.start_time);
    const shiftEnd = timeToMinutes(shift.end_time);

    for (let start = shiftStart; start + duration <= shiftEnd; start += step) {
      const slotStart = start;
      const slotEnd = start + duration;
      const timeString = minutesToTime(slotStart);

      // A. If today, filter out past slots (buffer of 30 minutes in advance)
      if (isToday && slotStart < currentMinutesNow + 30) {
        continue;
      }

      // B. Check if overlaps with any partial holidays/blocks
      let isBlocked = false;
      for (const block of dayBlocks) {
        if (block.start_time && block.end_time) {
          const bStart = timeToMinutes(block.start_time);
          const bEnd = timeToMinutes(block.end_time);
          if (slotStart < bEnd && slotEnd > bStart) {
            isBlocked = true;
            break;
          }
        }
      }

      if (isBlocked) {
        continue;
      }

      // C. Check concurrent bookings limit
      let concurrentBookingsCount = 0;
      for (const booking of dayBookings) {
        const bStart = timeToMinutes(booking.booking_time);
        const bEnd = bStart + booking.duration;
        if (slotStart < bEnd && slotEnd > bStart) {
          concurrentBookingsCount += Number(booking.quantity || 1);
        }
      }

      const remainingCapacity = Math.max(0, service.max_concurrent_bookings - concurrentBookingsCount);
      const reqQty = quantity || 1;
      const isAvailable = remainingCapacity >= reqQty;

      slots.push({
        time: timeString.substring(0, 5), // "HH:MM"
        available: isAvailable,
        reason: isAvailable ? undefined : 'Capacidad máxima alcanzada',
        remainingCapacity
      });
    }
  }
  // Sort slots chronologically from earliest to latest
  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

export async function getAvailableSlots({ serviceId, dateStr, quantity, excludeBookingId }: AvailabilityParams): Promise<BookingSlot[]> {
  try {
    // 1. Fetch Service details
    const { data: service, error: sErr } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId);

    if (sErr || !service || service.length === 0) {
      throw new Error('Servicio no encontrado');
    }
    const s = service[0];

    if (!s.active) {
      return [];
    }

    // 2. Check if the weekday is enabled
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.

    const weekdayMap = [
      s.enabled_sunday,
      s.enabled_monday,
      s.enabled_tuesday,
      s.enabled_wednesday,
      s.enabled_thursday,
      s.enabled_friday,
      s.enabled_saturday
    ];

    if (!weekdayMap[dayOfWeek]) {
      return []; // Not working on this weekday
    }

    // 3. Check for Holidays or Full Day Blocks
    const { data: blocks, error: bErr } = await supabase
      .from('holidays_blocks')
      .select('*')
      .eq('date', dateStr);

    if (bErr) throw bErr;

    // 4. Fetch service hours (shifts) for this service & weekday
    const { data: hours, error: hErr } = await supabase
      .from('service_hours')
      .select('*')
      .eq('service_id', serviceId)
      .eq('day_of_week', dayOfWeek);

    if (hErr) throw hErr;

    // 5. Fetch existing bookings for this date and service
    let bookingsQuery = supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', dateStr)
      .eq('service_id', serviceId)
      .neq('status', 'CANCELLED')
      .neq('status', 'NO_SHOW');

    if (excludeBookingId) {
      bookingsQuery = bookingsQuery.neq('id', excludeBookingId);
    }

    const { data: bookings, error: bkErr } = await bookingsQuery;

    if (bkErr) throw bkErr;

    return computeSlotsForDay({
      service: s,
      dateStr,
      dayBlocks: blocks || [],
      dayHours: hours || [],
      dayBookings: bookings || [],
      quantity
    });
  } catch (err: any) {
    console.error('Error al generar disponibilidad:', err);
    return [];
  }
}

export interface RangeAvailabilityParams {
  serviceId: string;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  quantity?: number;
  excludeBookingId?: string;
}

export async function getAvailableDaysForRange({
  serviceId,
  startDateStr,
  endDateStr,
  quantity,
  excludeBookingId
}: RangeAvailabilityParams): Promise<Set<string>> {
  try {
    // 1. Fetch Service details
    const { data: service, error: sErr } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId);

    if (sErr || !service || service.length === 0) {
      throw new Error('Servicio no encontrado');
    }
    const s = service[0];

    if (!s.active) {
      return new Set();
    }

    // 2. Fetch all holiday blocks in the date range
    const { data: blocks, error: bErr } = await supabase
      .from('holidays_blocks')
      .select('*')
      .gte('date', startDateStr)
      .lte('date', endDateStr);

    if (bErr) throw bErr;

    // 3. Fetch all service hours for this service
    const { data: hours, error: hErr } = await supabase
      .from('service_hours')
      .select('*')
      .eq('service_id', serviceId);

    if (hErr) throw hErr;

    // 4. Fetch all bookings in the date range for this service
    let bookingsQuery = supabase
      .from('bookings')
      .select('*')
      .eq('service_id', serviceId)
      .gte('booking_date', startDateStr)
      .lte('booking_date', endDateStr)
      .neq('status', 'CANCELLED')
      .neq('status', 'NO_SHOW');

    if (excludeBookingId) {
      bookingsQuery = bookingsQuery.neq('id', excludeBookingId);
    }

    const { data: bookings, error: bkErr } = await bookingsQuery;
    if (bkErr) throw bkErr;

    // 5. Calculate availability for each day in the range
    const availableDays = new Set<string>();

    const startObj = new Date(startDateStr + 'T00:00:00');
    const endObj = new Date(endDateStr + 'T00:00:00');

    // Loop through each date
    for (let current = new Date(startObj); current <= endObj; current.setDate(current.getDate() + 1)) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();

      // Check if weekday is enabled
      const weekdayMap = [
        s.enabled_sunday,
        s.enabled_monday,
        s.enabled_tuesday,
        s.enabled_wednesday,
        s.enabled_thursday,
        s.enabled_friday,
        s.enabled_saturday
      ];

      if (!weekdayMap[dayOfWeek]) {
        continue;
      }

      // Filter blocks, service hours, and bookings for the day
      const dayBlocks = (blocks || []).filter((b: any) => b.date === dateStr);
      const dayHours = (hours || []).filter((h: any) => h.day_of_week === dayOfWeek);
      const dayBookings = (bookings || []).filter((bk: any) => bk.booking_date === dateStr);

      const slots = computeSlotsForDay({
        service: s,
        dateStr,
        dayBlocks,
        dayHours,
        dayBookings,
        quantity
      });

      if (slots.some(slot => slot.available)) {
        availableDays.add(dateStr);
      }
    }

    return availableDays;
  } catch (err) {
    console.error('Error calculating range availability:', err);
    return new Set();
  }
}
