import '@testing-library/jest-dom'

// Set environment variables for tests
process.env.NEXTAUTH_SECRET = 'test-secret'

// Mock next/navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '',
}))
