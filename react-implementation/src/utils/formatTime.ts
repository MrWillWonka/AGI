/**
 * Formats a total number of seconds into an HH:MM:SS string.
 */
export const formatTime = (totalSeconds: number): string => {
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor(totalSeconds / 3600);

    const ss = seconds.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const hh = hours.toString().padStart(2, '0'); // Or just hours.toString() if you don't want leading zero for hours

    return `${hh}:${mm}:${ss}`;
}; 