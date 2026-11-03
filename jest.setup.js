import '@testing-library/jest-dom'

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

// Components call useNavTransition / useStartNavTransition, which throw outside
// <NavProgressProvider>. Tests render components bare, so replace the hooks with
// plain equivalents: navigate through the (mocked) router, run callbacks directly.
jest.mock('@/components/NavProgress', () => ({
  NavProgressProvider: ({ children }) => children,
  NavProgressBar: () => null,
  useNavTransition: () => {
    const { useRouter } = require('next/navigation')
    const router = useRouter()
    return [false, (href) => router.push(href)]
  },
  useStartNavTransition: () => (callback) => callback(),
}))
