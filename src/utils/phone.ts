export const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  
  // Eliminar cualquier caracter que no sea un número
  let digits = phone.replace(/\D/g, '');
  
  // Quitar un 0 a la izquierda si el usuario lo ingresó (Ej. 0264 -> 264)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // Si tiene 10 dígitos, probablemente es Código de área (3-4) + Número (6-7) sin el 15. Ej: 2644518136
  if (digits.length === 10) {
    return '549' + digits;
  }
  
  // Si tiene 12 dígitos y empieza con 54, asume que le falta el 9 para ser móvil en Argentina
  if (digits.length === 12 && digits.startsWith('54') && !digits.startsWith('549')) {
    return '549' + digits.substring(2);
  }
  
  // Si alguien escribe el código de área, el '15' y el número de 7 dígitos: Ej 264154518136 (12 dígitos)
  if (digits.length === 12 && digits.substring(3, 5) === '15') {
    return '549' + digits.substring(0, 3) + digits.substring(5);
  }

  // Si alguien escribe 0264154518136, el 0 inicial ya se quitó, pero tiene 12 dígitos, entra en la regla anterior.
  
  return digits;
};
