// Runs before every test file. Modules such as the auth middleware read these
// at import time, so they must exist before the app is imported.
// NODE_ENV is set to "test" by vitest itself.
process.env.COGNITO_USER_POOL_ID ??= "us-east-2_testpool";
process.env.COGNITO_CLIENT_ID ??= "test-client-id";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AWS_REGION ??= "us-east-2";
process.env.S3_BUCKET_NAME ??= "test-bucket";
