-- Create test database for CI/testing
SELECT 'CREATE DATABASE maof_test OWNER maof'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'maof_test')\gexec

-- Enable UUID extension
\c maof_dev
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c maof_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
