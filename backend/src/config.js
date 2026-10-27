const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

export const config = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Lista separada por comas. Vacío = se permite cualquier origen (útil en desarrollo).
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  port: Number(process.env.PORT) || 3000,
};
