export const PASSWORD_REQUIREMENTS = '영문, 숫자, 특수문자를 포함해 8자 이상 입력해주세요.';

export function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
