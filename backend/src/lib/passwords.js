import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Hash de relleno para que un email inexistente tarde lo mismo que uno válido.
export const DUMMY_HASH = bcrypt.hashSync('contraseña-de-relleno', ROUNDS);
