import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';

/**
 * Migration script to add new columns to existing songs table
 * This will preserve all existing data while adding new metadata fields
 */

const migrateDatabase = () => {
    const db: Database = new sqlite3.Database('music.db');

    console.log('Starting database migration...');

    db.serialize(() => {
        // Check if columns already exist before adding them
        db.all(
            'PRAGMA table_info(songs)',
            [],
            (err: Error | null, columns: Array<{ name: string }>) => {
                if (err) {
                    console.error('Error checking table structure:', err);
                    return;
                }

                const columnNames = columns.map((col) => col.name);
                const newColumns = [
                    {
                        name: 'uploadedBy',
                        sql: 'ALTER TABLE songs ADD COLUMN uploadedBy TEXT',
                    },
                    {
                        name: 'visibility',
                        sql: "ALTER TABLE songs ADD COLUMN visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public'",
                    },
                    {
                        name: 'year',
                        sql: 'ALTER TABLE songs ADD COLUMN year INTEGER',
                    },
                    {
                        name: 'bpm',
                        sql: 'ALTER TABLE songs ADD COLUMN bpm INTEGER',
                    },
                    {
                        name: 'mood',
                        sql: 'ALTER TABLE songs ADD COLUMN mood TEXT',
                    },
                    {
                        name: 'language',
                        sql: 'ALTER TABLE songs ADD COLUMN language TEXT',
                    },
                    {
                        name: 'lyrics',
                        sql: 'ALTER TABLE songs ADD COLUMN lyrics TEXT',
                    },
                    {
                        name: 'playCount',
                        sql: 'ALTER TABLE songs ADD COLUMN playCount INTEGER DEFAULT 0',
                    },
                    {
                        name: 'tags',
                        sql: 'ALTER TABLE songs ADD COLUMN tags TEXT',
                    },
                ];

                let migrationsRun = 0;
                let migrationsSkipped = 0;

                newColumns.forEach(({ name, sql }) => {
                    if (!columnNames.includes(name)) {
                        db.run(sql, (err: Error | null) => {
                            if (err) {
                                console.error(
                                    `Error adding column ${name}:`,
                                    err,
                                );
                            } else {
                                console.log(`✓ Added column: ${name}`);
                                migrationsRun++;
                            }
                        });
                    } else {
                        console.log(
                            `- Column ${name} already exists, skipping`,
                        );
                        migrationsSkipped++;
                    }
                });

                // Set default values for existing songs after a small delay to ensure columns are added
                setTimeout(() => {
                    db.run(
                        "UPDATE songs SET visibility = 'public' WHERE visibility IS NULL",
                        (err: Error | null) => {
                            if (err) {
                                console.error(
                                    'Error setting default visibility:',
                                    err,
                                );
                            } else {
                                console.log(
                                    '✓ Set default visibility for existing songs',
                                );
                            }
                        },
                    );

                    db.run(
                        'UPDATE songs SET playCount = 0 WHERE playCount IS NULL',
                        (err: Error | null) => {
                            if (err) {
                                console.error(
                                    'Error setting default playCount:',
                                    err,
                                );
                            } else {
                                console.log(
                                    '✓ Set default playCount for existing songs',
                                );
                            }
                        },
                    );

                    console.log('\n=== Migration Summary ===');
                    console.log(`Migrations run: ${migrationsRun}`);
                    console.log(`Migrations skipped: ${migrationsSkipped}`);
                    console.log('Migration completed successfully!');

                    db.close();
                }, 1000);
            },
        );
    });
};

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    migrateDatabase();
}

export default migrateDatabase;
