import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App frontend flows', () => {
  it('renders all primary flow tabs', () => {
    render(<App />)

    expect(screen.getByText('Registration')).toBeTruthy()
    expect(screen.getByText('Plan Subscription')).toBeTruthy()
    expect(screen.getByText('Claim Submission')).toBeTruthy()
    expect(screen.getByText('Tracking Dashboard')).toBeTruthy()
  })
})
