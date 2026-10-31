// Datos base: cintas, danes y tules ITF, entidades federales de Venezuela y,
// opcionalmente, un usuario administrador.
//
// Es idempotente: cada registro se inserta solo si no existe ya uno con el
// mismo nombre, esté activo o eliminado. Así, volver a correrlo no duplica
// nada ni restaura lo que se haya borrado a propósito desde la aplicación.

export const CINTAS = [
  'Blanca',
  'Blanca punta amarilla',
  'Amarilla',
  'Amarilla punta verde',
  'Verde',
  'Verde punta azul',
  'Azul',
  'Azul punta roja',
  'Roja',
  'Roja punta negra',
  'Negra',
];

export const DANES = ['1er Dan', '2do Dan', '3er Dan', '4to Dan', '5to Dan', '6to Dan', '7mo Dan', '8vo Dan', '9no Dan'];

// Los 24 tules ITF, en el orden en que se aprenden.
export const TULES = [
  'Chon-Ji',
  'Dan-Gun',
  'Do-San',
  'Won-Hyo',
  'Yul-Gok',
  'Joong-Gun',
  'Toi-Gye',
  'Hwa-Rang',
  'Choong-Moo',
  'Kwang-Gae',
  'Po-Eun',
  'Ge-Baek',
  'Eui-Am',
  'Choong-Jang',
  'Juche',
  'Sam-Il',
  'Yoo-Sin',
  'Choi-Yong',
  'Yon-Gae',
  'Ul-Ji',
  'Moon-Moo',
  'So-San',
  'Se-Jong',
  'Tong-Il',
];

// Los 23 estados más el Distrito Capital.
export const ESTADOS = [
  'Amazonas',
  'Anzoátegui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolívar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Distrito Capital',
  'Falcón',
  'Guárico',
  'La Guaira',
  'Lara',
  'Mérida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Táchira',
  'Trujillo',
  'Yaracuy',
  'Zulia',
];

// ON CONFLICT cubre el caso de que otro registro activo ya use el mismo
// orden/número con distinto nombre: se omite en lugar de fallar.
async function insertMissing(query, sql, rows) {
  let inserted = 0;
  for (const params of rows) inserted += (await query(sql, params)).rowCount;
  return inserted;
}

export async function seed(query, { admin } = {}) {
  const result = {
    cintas: await insertMissing(
      query,
      `INSERT INTO cintas (nombre, orden)
       SELECT $1::varchar, $2::smallint
       WHERE NOT EXISTS (SELECT 1 FROM cintas WHERE nombre = $1)
       ON CONFLICT DO NOTHING`,
      CINTAS.map((nombre, i) => [nombre, i + 1]),
    ),
    danes: await insertMissing(
      query,
      `INSERT INTO danes (nombre, numero)
       SELECT $1::varchar, $2::smallint
       WHERE NOT EXISTS (SELECT 1 FROM danes WHERE nombre = $1)
       ON CONFLICT DO NOTHING`,
      DANES.map((nombre, i) => [nombre, i + 1]),
    ),
    estados: await insertMissing(
      query,
      `INSERT INTO estados (nombre)
       SELECT $1::varchar
       WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre = $1)
       ON CONFLICT DO NOTHING`,
      ESTADOS.map((nombre) => [nombre]),
    ),
    tules: await insertMissing(
      query,
      `INSERT INTO tules (nombre, orden)
       SELECT $1::varchar, $2::smallint
       WHERE NOT EXISTS (SELECT 1 FROM tules WHERE nombre = $1)
       ON CONFLICT DO NOTHING`,
      TULES.map((nombre, i) => [nombre, i + 1]),
    ),
    admin: 0,
  };

  if (admin?.email && admin?.passwordHash) {
    result.admin = (
      await query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol)
         SELECT $1::varchar, $2::varchar, $3::varchar, 'admin'
         WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = $2)
         ON CONFLICT DO NOTHING`,
        [admin.nombre || 'Administrador', admin.email.trim().toLowerCase(), admin.passwordHash],
      )
    ).rowCount;
  }
  return result;
}
