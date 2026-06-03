// Availability Engine for Petshop Booking System

import { supabase } from './supabase';

export interface BookingSlot {
  time: string; // "HH:MM:SS" or "HH:MM"
  available: boolean;
  reason?: string;
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
}

export async function getAvailableSlots({ serviceId, dateStr }: AvailabilityParams): Promise<BookingSlot[]> {
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

    // If there is an all-day block
    const allDayBlock = (blocks || []).find((b: any) => !b.start_time || b.start_time === '');
    if (allDayBlock) {
      return []; // Closed full day
    }

    // 4. Fetch service hours (shifts) for this service & weekday
    let { data: hours, error: hErr } = await supabase
      .from('service_hours')
      .select('*')
      .eq('service_id', serviceId)
      .eq('day_of_week', dayOfWeek);

    if (hErr) throw hErr;

    // Fallback default shifts (09:00 - 13:00, 16:00 - 20:00) if none are database defined
    if (!hours || hours.length === 0) {
      hours = [
        { start_time: '09:00:00', end_time: '13:00:00' },
        { start_time: '16:00:00', end_time: '20:00:00' }
      ];
    }

    // 5. Fetch existing bookings for this date and service
    const { data: bookings, error: bkErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', dateStr)
      .eq('service_id', serviceId)
      .neq('status', 'CANCELLED')
      .neq('status', 'NO_SHOW');

    if (bkErr) throw bkErr;

    // 6. Generate candidate slots at service duration intervals
    const duration = s.estimated_duration_minutes;
    const step = duration > 0 ? duration : 30;
    const slots: BookingSlot[] = [];
    const now = new Date();
    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

    for (const shift of hours) {
      const shiftStart = timeToMinutes(shift.start_time);
      const shiftEnd = timeToMinutes(shift.end_time);

      // Check slot candidates starting every service duration
      for (let start = shiftStart; start + duration <= shiftEnd; start += step) {
        const slotStart = start;
        const slotEnd = start + duration;
        const timeString = minutesToTime(slotStart);

        // A. If today, filter out past slots (e.g. buffer of 30 minutes in advance)
        if (isToday && slotStart < currentMinutesNow + 30) {
          continue;
        }

        // B. Check if overlaps with any partial holidays/blocks
        let isBlocked = false;
        if (blocks && blocks.length > 0) {
          for (const block of blocks) {
            if (block.start_time && block.end_time) {
              const bStart = timeToMinutes(block.start_time);
              const bEnd = timeToMinutes(block.end_time);
              // Overlap check
              if (slotStart < bEnd && slotEnd > bStart) {
                isBlocked = true;
                break;
              }
            }
          }
        }

        if (isBlocked) {
          continue; // Skip blocked slots
        }

        // C. Check concurrent bookings limit
        let concurrentBookingsCount = 0;
        if (bookings && bookings.length > 0) {
          for (const booking of bookings) {
            const bStart = timeToMinutes(booking.booking_time);
            const bEnd = bStart + booking.duration;

            // Check overlap
            if (slotStart < bEnd && slotEnd > bStart) {
              concurrentBookingsCount++;
            }
          }
        }

        const isAvailable = concurrentBookingsCount < s.max_concurrent_bookings;

        slots.push({
          time: timeString.substring(0, 5), // Return "HH:MM"
          available: isAvailable,
          reason: isAvailable ? undefined : 'Capacidad máxima alcanzada'
        });
      }
    }

    return slots;
  } catch (err: any) {
    console.error('Error al generar disponibilidad:', err);
    return [];
  }
}
