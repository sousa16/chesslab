# Authentication Tests

This directory contains comprehensive tests for the Chesslab authentication system.

## Test Coverage

### 1. Credentials Provider Tests (`credentials.test.ts`)
Tests for the NextAuth.js credentials provider that handles email/password authentication.

#### Registration Tests
- **Missing Credentials**: Validates that errors are thrown when email or password is missing
- **Successful Registration**: Tests creating new users with password hashing
- **Duplicate User**: Ensures users cannot register with existing email

#### Login Tests
- **User Not Found**: Validates error when user doesn't exist
- **OAuth-Only Users**: Tests that OAuth users (without password) cannot use credentials login
- **Invalid Password**: Tests incorrect password rejection
- **Successful Login**: Tests successful authentication with valid credentials

### 2. Auth Page Component Tests (`page.test.tsx`)
Tests for the authentication UI component at `/auth`.

#### UI Rendering
- Logo and welcome message display
- Email and password input fields
- Google sign-in button
- Sign in/up toggle

#### Form Interactions
- Toggling between login and register modes
- Updating form inputs
- Form disabling during loading
- Button state management

#### Google OAuth
- Google sign-in submission
- Callback URL handling
- Loading state during authentication

#### Email/Password Authentication
- Login form submission with correct credentials
- Registration form submission
- Error message display
- Unexpected error handling

#### Error States
- Display error messages in red text
- Show validation errors
- Handle network errors

### 3. Auth Options Tests (`options.test.ts`)
Tests for the NextAuth.js configuration.

#### Configuration Validation
- JWT session strategy
- Custom sign-in page (`/auth`)
- Provider configuration (Google + Credentials)

#### Callback Functions
- JWT callback: Adds user ID to token
- Session callback: Adds token ID to session user
- Proper token/session handling

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Generate coverage report
```bash
npm run test:coverage
```

## Test Structure

Each test file follows this structure:
1. **Imports**: Required modules and mocks
2. **Mocks**: Setup for external dependencies (prisma, bcryptjs, next-auth)
3. **Describe Blocks**: Logical grouping of related tests
4. **Test Cases**: Individual test cases with clear descriptions

## Key Testing Patterns

### Mocking External Dependencies
- `prisma`: Database operations are mocked
- `bcryptjs`: Password hashing/comparison is mocked
- `next-auth/react`: SignIn function is mocked for component tests

### Setup/Teardown
- `beforeEach`: Clear mocks before each test
- Ensures tests don't affect each other

### Assertions
- Verify correct function calls with expected arguments
- Check returned values match expected output
- Validate error messages and states

## Code Coverage Goals

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

Current coverage focuses on:
- ✅ Credentials provider (registration & login logic)
- ✅ Auth page component (UI & interactions)
- ✅ Auth configuration (callbacks & strategies)
- ⏳ API routes (to be added)
- ⏳ Protected pages (to be added)

## Common Test Scenarios

### Authentication Errors
- Missing credentials
- User not found
- Invalid password
- User already exists
- OAuth-only accounts

### Happy Path Scenarios
- Successful registration
- Successful login
- Google OAuth flow
- Session management

### UI Interactions
- Form submission
- Input changes
- Button clicks
- Mode toggling

## Dependencies

The test setup requires:
- `jest`: Testing framework
- `@testing-library/react`: React component testing utilities
- `@testing-library/user-event`: User interaction simulation
- `@testing-library/jest-dom`: Custom Jest matchers
- `jest-environment-jsdom`: DOM environment for tests

## Notes

- Tests use `jest.mock()` for external dependencies
- Component tests use `userEvent` for more realistic interactions
- All tests are async-safe with proper `await` and `waitFor` usage
- Error messages are validated to ensure proper user communication
