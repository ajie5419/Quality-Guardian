const AFTER_SALES_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const AFTER_SALES_ID_SUFFIX_SIZE = 8;

function createAfterSalesIdSuffix(size = AFTER_SALES_ID_SUFFIX_SIZE) {
  let output = '';
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(
      Math.random() * AFTER_SALES_ID_ALPHABET.length,
    );
    output += AFTER_SALES_ID_ALPHABET[randomIndex];
  }
  return output;
}

export function createAfterSalesId(): string {
  return `AS-${new Date().getFullYear()}-${createAfterSalesIdSuffix()}`;
}
