
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [inviteToken, setInviteToken] = useState(
  new URLSearchParams(window.location.search).get('invite') || ''
)
  const [familyId, setFamilyId] = useState(null)
  const [items, setItems] = useState([])
  const [page, setPage] = useState('tasks')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [inputText, setInputText] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setFamilyId(null)
      setItems([])
      return
    }

    async function findFamily() {
      const { data, error } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error) {
        setMessage(error.message)
        return
      }

      if (!data) {
        setMessage('Your account is not linked to a family yet.')
        return
      }

      setFamilyId(data.family_id)
      setMessage('')
    }

    findFamily()
  }, [session])

  async function refreshItems() {
    if (!familyId) return

    const { data, error } = await supabase
      .from('family_items')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setItems(data || [])
    setMessage('')
  }

  useEffect(() => {
    if (!familyId) return

    refreshItems()

    const channel = supabase
      .channel('family-items-' + familyId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'family_items',
          filter: 'family_id=eq.' + familyId,
        },
        () => refreshItems()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      if (isSigningUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) throw error

        setMessage(
          data.session
            ? 'Account created successfully!'
            : 'Check your email to confirm your account.'
        )
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        
        if (error) throw error

        if (inviteToken) {
          await handleAcceptInvitation()
        }

      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptInvitation() {
    if (!inviteToken) return

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
      setMessage('Please sign in with the invited email address to accept your invitation.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase.functions.invoke(
        'accept-invitation',
        {
          body: { token: inviteToken },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (error) throw error

      setMessage(data?.message || 'Invitation accepted successfully!')
      setInviteToken('')
      window.location.reload()
      window.history.replaceState({}, '', '/')
    } catch (error) {
      setMessage(error.message || 'Could not accept the invitation.')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setMessage('')

    if (!inviteEmail.trim() || !familyId) {
      setMessage('Please enter an email address and make sure your family is loaded.')
      return
    }

    setInviteLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      if (!accessToken) {
        throw new Error('Please sign in again.')
      }

      const { data, error } = await supabase.functions.invoke('swift-processor', {
        body: {
          email: inviteEmail.trim(),
          familyId: familyId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (error) throw error

      setMessage(data?.message || 'Invitation request sent.')
      setInviteEmail('')
    } catch (error) {
      setMessage(error.message || 'Could not send the invitation.')
    } finally {
      setInviteLoading(false)
    }
  }

  async function addItem(e) {
    e.preventDefault()
    if (!inputText.trim() || !familyId) return

    setLoading(true)

    const { error } = await supabase.from('family_items').insert({
      family_id: familyId,
      list_type: page,
      text: inputText.trim(),
      done: false,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setInputText('')
      await refreshItems()
    }

    setLoading(false)
  }

  async function toggleItem(item) {
    const { error } = await supabase
      .from('family_items')
      .update({ done: !item.done })
      .eq('id', item.id)
      .eq('family_id', familyId)

    if (error) setMessage(error.message)
    else await refreshItems()
  }

  async function deleteItem(item) {
    const { error } = await supabase
      .from('family_items')
      .delete()
      .eq('id', item.id)
      .eq('family_id', familyId)

    if (error) setMessage(error.message)
    else await refreshItems()
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  const isTasks = page === 'tasks'
  const visibleItems = items.filter(item => item.list_type === page)
  const remaining = visibleItems.filter(item => !item.done).length

  return (
    <main className="app">
      <header className="header">
        <div className="logo">🏡 HomeTogether</div>
        <p>One family. One place. Everything organised.</p>
      </header>

      {!session ? (
        <section className="panel">
          <h1>{isSigningUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className="subtitle">Sign in to your family space.</p>

          <form className="add-form" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password (at least 6 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : isSigningUp
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          {message && <p>{message}</p>}

          <button onClick={() => {
            setIsSigningUp(!isSigningUp)
            setMessage('')
          }}>
            {isSigningUp ? 'Sign in instead' : 'Create a new account'}
          </button>
        </section>
      ) : !familyId ? (
        <section className="panel">
          <h1>Welcome to HomeTogether!</h1>
          <p>{message || 'Finding your family...'}</p>
          <button onClick={handleSignOut}>Sign out</button>
        </section>
      ) : (
        <>
          <p>Signed in as {session.user.email}</p>

          <nav className="tabs">
            <button
              className={isTasks ? 'active' : ''}
              onClick={() => {
                setPage('tasks')
                setInputText('')
                setMessage('')
              }}
            >
              ✓ To-do list
            </button><button
  className={page === 'invite' ? 'active' : ''}
  onClick={() => {
    setPage('invite')
    setMessage('')
  }}
>
  ✉️ Invite family
</button>
            <button
              className={!isTasks ? 'active' : ''}
              onClick={() => {
                setPage('shopping')
                setInputText('')
                setMessage('')
              }}
            >
              🛒 Shopping list
            </button>
          </nav>

          
{page === 'invite' ? (
  <section className="panel">
    <h1>Invite family</h1>
    <p className="subtitle">
      Invite your family to share your to-do and shopping lists.
    </p>

    <form onSubmit={handleInvite} className="add-form">
      <input
        type="email"
        value={inviteEmail}
        onChange={e => setInviteEmail(e.target.value)}
        placeholder="Enter family member's email..."
        required
      />
      <button type="submit" disabled={inviteLoading}>
        {inviteLoading ? 'Sending...' : 'Send invitation'}
      </button>
    </form>

    {message && <p>{message}</p>}
  </section>
) : (
  <section className="panel">

            <h1>{isTasks ? 'Family to-do list' : 'Family shopping list'}</h1>
            <p className="subtitle">
              {isTasks
                ? 'Keep track of what needs to get done.'
                : 'Everything your family needs to buy.'}
            </p>

            <form className="add-form" onSubmit={addItem}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={isTasks ? 'Add a family task...' : 'Add a shopping item...'}
                required
              />
              <button type="submit" disabled={loading}>+ Add</button>
            </form>

            <div className="summary">
              {remaining} item{remaining !== 1 ? 's' : ''} remaining
            </div>

            {message && <p>{message}</p>}

            {visibleItems.length === 0 ? (
              <div className="empty">
                <span>{isTasks ? '📝' : '🛍️'}</span>
                <p>Your list is empty. Add your first item above!</p>
              </div>
            ) : (
              <ul className="items">
                {visibleItems.map(item => (
                  <li key={item.id} className={item.done ? 'completed' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleItem(item)}
                      />
                      <span>{item.text}</span>
                    </label>
                    <button
                      className="delete"
                      onClick={() => deleteItem(item)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={refreshItems}>Refresh list</button>
</section>
)}

<button onClick={handleSignOut}>Sign out</button>
        </>
      )}

      <footer>Made for your family ❤️</footer>
    </main>
  )
}

export default App
