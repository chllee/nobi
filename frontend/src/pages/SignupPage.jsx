import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, ErrorMsg, Field, Footer, Input, Label, Page, SubmitButton, Title } from '../styles/auth'

export default function SignupPage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [displayName, setDisplayName] = useState('')
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    setSubmitting(false)
    if (error) return setError(error.message)
    navigate('/')
  }

  return (
    <Page>
      <Card>
        <Title>Create your account</Title>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
          </Field>
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
              minLength={6}
            />
          </Field>
          <SubmitButton type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </SubmitButton>
        </form>
        <Footer>
          Already have an account? <Link to="/login">Sign in</Link>
        </Footer>
      </Card>
    </Page>
  )
}
