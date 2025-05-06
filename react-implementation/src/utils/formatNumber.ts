/**
 * Formats a number into a more readable string using suffixes (K, M, B, T...).
 * Handles smaller numbers with fixed decimal places.
 */
export const formatNumber = (num: number, precision: number = 1): string => {
    if (num === 0) return '0';
    if (Math.abs(num) < 1) return num.toFixed(Math.max(precision, 2)); // Show more precision for small decimals

    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']; // Add more as needed
    const tier = Math.floor(Math.log10(Math.abs(num)) / 3);

    if (tier === 0) return num.toFixed(precision); // Show decimals for numbers < 1000
    if (tier >= suffixes.length) return num.toExponential(precision);

    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = num / scale;

    return scaled.toFixed(precision) + suffix;
}; 