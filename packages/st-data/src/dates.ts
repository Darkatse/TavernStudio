/**
 * The timestamp format SillyTavern uses in generated chat names, for example
 * `2023-5-12 @21h 32m 29s 224ms` (src/util.js humanizedDateTime).
 */
export function humanizedDateTime(date = new Date()): string {
  return (
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ` +
    `@${date.getHours()}h ${date.getMinutes()}m ${date.getSeconds()}s ${date.getMilliseconds()}ms`
  );
}
