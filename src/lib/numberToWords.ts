/**
 * Indian Rupee Number to Words Converter.
 * Formats numeric values to formal Indian Currency words (Crores, Lakhs, Thousands, Hundreds).
 */
export function numberToWordsInr(amount: number): string {
  if (isNaN(amount) || amount === 0) return "Rupees Zero Only";

  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertTwoDigits(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? " " + a[digit] : "");
  }

  function convertThreeDigits(n: number): string {
    let str = "";
    const hundreds = Math.floor(n / 100);
    const remainder = n % 100;
    if (hundreds > 0) {
      str += a[hundreds] + " Hundred ";
    }
    if (remainder > 0) {
      str += convertTwoDigits(remainder);
    }
    return str.trim();
  }

  const rounded = Math.floor(Math.abs(amount));
  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const remainder = rounded % 1000;

  let words = "";
  if (crore > 0) words += convertThreeDigits(crore) + " Crore ";
  if (lakh > 0) words += convertThreeDigits(lakh) + " Lakh ";
  if (thousand > 0) words += convertThreeDigits(thousand) + " Thousand ";
  if (remainder > 0) words += convertThreeDigits(remainder) + " ";

  const result = ("Rupees " + words.trim() + " Only").replace(/\s+/g, " ");
  return result;
}
