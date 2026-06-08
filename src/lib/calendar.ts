// ICS Calendar File Generator for Petshop Bookings

export interface CalendarEventPayload {
  serviceName: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM or HH:MM:SS
  durationMinutes: number;
  businessName: string;
  address: string;
}

// Formats a Date object to YYYYMMDDTHHMMSSZ for ICS format
function formatICSDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

export function generateICS(payload: CalendarEventPayload): string {
  // Parse local date & time
  const [year, month, day] = payload.date.split('-').map(Number);
  const [hours, minutes] = payload.time.split(':').map(Number);
  
  // Date in local timezone
  const startDate = new Date(year, month - 1, day, hours, minutes, 0);
  const endDate = new Date(startDate.getTime() + payload.durationMinutes * 60000);
  
  const dtStamp = formatICSDate(new Date());
  const dtStart = formatICSDate(startDate);
  const dtEnd = formatICSDate(endDate);
  
  const domain = payload.businessName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'petshop';
  const uid = `booking-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@${domain}.com`;
  const summary = `Turno: ${payload.serviceName} - ${payload.businessName}`;
  const description = `Turno reservado para el servicio de ${payload.serviceName} en ${payload.businessName}. Duración estimada: ${payload.durationMinutes} minutos.`;
  const location = payload.address;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${payload.businessName}//Petshop Booking System//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

export function downloadICSFile(payload: CalendarEventPayload) {
  const icsContent = generateICS(payload);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  
  // Clean filename: e.g. turno_Bano_Standard_2026-06-03.ics
  const serviceClean = payload.serviceName.replace(/\s+/g, '_');
  link.setAttribute('download', `turno_${serviceClean}_${payload.date}.ics`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(payload: CalendarEventPayload): string {
  const [year, month, day] = payload.date.split('-').map(Number);
  const [hours, minutes] = payload.time.split(':').map(Number);
  
  const startDate = new Date(year, month - 1, day, hours, minutes, 0);
  const endDate = new Date(startDate.getTime() + payload.durationMinutes * 60000);
  
  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  
  const dates = `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`;
  const text = encodeURIComponent(`Turno: ${payload.serviceName} - ${payload.businessName}`);
  const details = encodeURIComponent(`Turno reservado en ${payload.businessName}. Duración estimada: ${payload.durationMinutes} minutos.`);
  const location = encodeURIComponent(payload.address);
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
}
