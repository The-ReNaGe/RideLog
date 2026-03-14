import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Admin({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAllUsers();
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors du chargement des utilisateurs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${username}" ?\n\nSes véhicules et données seront supprimés.`)) {
      return;
    }

    setDeleting(userId);
    try {
      await api.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la suppression');
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handlePromoteUser = async (userId, username, isCurrentlyAdmin) => {
    const action = isCurrentlyAdmin ? 'rétrograder en utilisateur' : 'promouvoir administrateur';
    if (!window.confirm(`Êtes-vous sûr de vouloir ${action} "${username}" ?`)) {
      return;
    }

    setDeleting(userId);
    try {
      await api.promoteUser(userId);
      // Recharge la liste
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || `Erreur lors de la ${action}`);
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  if (!currentUser?.is_admin) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto mt-8">
        <h2 className="text-xl font-bold" style={{ color: 'var(--danger)' }}>🔒 Accès refusé</h2>
        <p className="text-secondary text-sm mt-2">Vous n'êtes pas administrateur</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-1)' }}>
        🛡️ Console Admin
      </h2>

      {error && (
        <div
          className="mb-4 p-3 rounded text-sm"
          style={{
            background: 'var(--danger-light)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <div className="card p-6 gap-section">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
          Gestion des utilisateurs
        </h3>

        {loading ? (
          <div className="text-center py-6">
            <div className="spinner mx-auto mb-2"></div>
            <p style={{ color: 'var(--text-2)' }}>Chargement...</p>
          </div>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>Aucun utilisateur</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Utilisateur</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Nom affiché</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Rôle</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Créé le</th>
                  <th className="text-left py-3 px-3" style={{ color: 'var(--text-2)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isServiceAccount = user.username === 'homeassistant';
                  return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-3 px-3">
                      <span style={{ color: 'var(--text-1)' }}>@{user.username}</span>
                      {user.id === currentUser.id && (
                        <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>(Vous)</span>
                      )}
                      {isServiceAccount && (
                        <span className="text-xs ml-2" style={{ color: '#9333ea' }}>🤖 Service</span>
                      )}
                    </td>
                    <td className="py-3 px-3" style={{ color: 'var(--text-2)' }}>
                      {user.display_name}
                    </td>
                    <td className="py-3 px-3">
                      {isServiceAccount ? (
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            background: '#ddd6fe',
                            color: '#5b21b6'
                          }}
                        >
                          🤖 SERVICE
                        </span>
                      ) : user.is_admin ? (
                        <span
                          className="inline-block px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            background: 'var(--success)',
                            color: 'white'
                          }}
                        >
                          ADMIN
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Utilisateur
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-2">
                        {user.id !== currentUser.id && !isServiceAccount && (
                          <button
                            onClick={() => handlePromoteUser(user.id, user.username, user.is_admin)}
                            disabled={deleting === user.id}
                            className={`text-xs ${user.is_admin ? 'btn btn-secondary' : 'btn btn-primary'}`}
                            title={user.is_admin ? 'Rétrograder en utilisateur' : 'Promouvoir administrateur'}
                          >
                            {user.is_admin ? '👤 Rétrograder' : '🛡️ Promouvoir'}
                          </button>
                        )}
                        {isServiceAccount && (
                          <span className="text-xs px-2 py-1" style={{ color: 'var(--text-3)' }}>
                            ⛔ Compte protégé
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          disabled={user.id === currentUser.id || deleting === user.id || user.is_admin || isServiceAccount}
                          className="btn btn-danger text-xs"
                          style={{
                            opacity: (user.id === currentUser.id || user.is_admin || isServiceAccount) ? 0.5 : 1,
                            cursor: (user.id === currentUser.id || user.is_admin || isServiceAccount) ? 'not-allowed' : 'pointer'
                          }}
                          title={isServiceAccount ? "Impossible : compte de service protégé" : (user.is_admin ? "Impossible : rétrogradez-le d'abord" : 'Supprimer cet utilisateur')}
                        >
                          {deleting === user.id ? '...' : '🗑️ Supprimer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6 gap-section mt-6 bg-blue-50 dark:bg-blue-900/20" style={{ background: 'var(--info-light)' }}>
        <h4 className="font-semibold" style={{ color: 'var(--text-1)' }}>ℹ️ Informations</h4>
        <ul className="text-xs space-y-1" style={{ color: 'var(--text-2)' }}>
          <li>✅ Le premier utilisateur créé est automatiquement administrateur</li>
          <li>✅ Seul un admin peut accéder à cette console</li>
          <li>✅ Un admin peut promouvoir/rétrograder d'autres utilisateurs</li>
          <li>🔒 Un admin ne peut pas modifier son propre statut</li>
          <li>🔒 <strong>Les administrateurs ne peuvent PAS être supprimés</strong> (rétrogradez-le d'abord)</li>
          <li>⚠️ Supprimer un utilisateur supprime aussi tous ses véhicules</li>
        </ul>
      </div>
    </div>
  );
}
