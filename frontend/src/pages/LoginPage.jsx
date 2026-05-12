import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, ErrorMsg, Field, Footer, Input, Label, Page, SubmitButton, Title } from '../styles/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true })
  }, [session, loading, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) return setError(error.message)
    navigate('/')
  }

  return (
    <Page>
      <Card>
        <Title>Sign in to Nobi</Title>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </Field>
          <SubmitButton type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
        </form>
        <Footer>
          No account? <Link to="/signup">Sign up</Link>
        </Footer>
      </Card>
    </Page>
  )
}
