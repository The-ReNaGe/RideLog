import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/preferencesContext';
import VehicleForm from '../components/VehicleForm';
import VehicleCard from '../components/VehicleCard';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';

// Helper module-level : `t` ne peut pas venir d'un hook ici, il se passe en
// argument. C'est ce qui manquait — la fonction référençait un `t` inexistant
// et la page plantait au rendu.
const countLabel = (n, t) =>
  n === 0 ? t('Aucun véhicule') : n === 1 ? t('1 véhicule') : t('{count} véhicules', { count: n });

/**
 * Bloc « garage » — un panneau fermé par garage.
 *
 * Un titre suivi de cartes flottantes ne délimite rien : avec plusieurs
 * garages à la suite, on ne voit plus où l'un s'arrête et où le suivant
 * commence. Le panneau (bordure, en-tête, fond creusé) répond à cette seule
 * question.
 */
function GaragePanel({ title, owner, subtitle, badge, count, action, children }) {
  const t = useT();
  // L'initiale est celle de la personne : « Garage de tata » donnerait « G »,
  // identique pour tous les garages, donc inutile.
  const initial = ((owner || title).match(/[A-Za-zÀ-ÿ0-9]/) || ['?'])[0];

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="avatar" aria-hidden="true">{initial}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="section-title">{title}</h2>
            {badge}
          </div>
          {subtitle && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{subtitle}</p>
          )}
        </div>
        <span className="badge badge-neutral">{countLabel(count, t)}</span>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

const GRID = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

export default function VehicleList({ onSelectVehicle, currentUser }) {
  const t = useT();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  // Le nom du foyer, quand il y en a un. C'est la seule chose que la personne
  // a elle-même nommée sur cet écran ; il n'apparaissait jusqu'ici que dans
  // les paramètres, et la page continuait de s'intituler d'après le compte.
  const [familyName, setFamilyName] = useState(null);

  useEffect(() => {
    fetchVehicles();
    // Un groupe absent n'est pas une erreur : la page marche sans.
    api.getFamily()
      .then((res) => setFamilyName(res.data?.family?.name || null))
      .catch(() => setFamilyName(null));
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const response = await api.getVehicles();
      setVehicles(response.data);
      setError(null);
    } catch (err) {
      setError(t('Impossible de charger les véhicules'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleCreated = () => {
    setShowForm(false);
    fetchVehicles();
  };


  // Séparation par propriétaire : ses véhicules d'abord, puis un garage par
  // membre du groupe famille. Mélangés dans une seule grille, on ne sait plus
  // à qui appartient quoi — et c'est justement la question que pose une vue
  // partagée.
  const { myVehicles, sharedGarages } = React.useMemo(() => {
    const mine = [];
    const byOwner = new Map();

    for (const v of vehicles) {
      const isMine = !v.owner_id || !currentUser?.id || v.owner_id === currentUser.id;
      if (isMine) {
        mine.push(v);
        continue;
      }
      if (!byOwner.has(v.owner_id)) {
        byOwner.set(v.owner_id, { ownerId: v.owner_id, name: v.owner_display_name, vehicles: [] });
      }
      byOwner.get(v.owner_id).vehicles.push(v);
    }

    return {
      myVehicles: mine,
      sharedGarages: [...byOwner.values()].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'fr')
      ),
    };
  }, [vehicles, currentUser]);

  if (loading && vehicles.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="spinner mx-auto mb-3"></div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('Chargement du garage…')}</p>
      </div>
    );
  }

  const renderCards = (list) => (
    <div className={GRID}>
      {list.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          onSelect={() => onSelectVehicle(vehicle.id)}
          currentUser={currentUser}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <PageHeader
        title={familyName || t('Mon garage')}
        subtitle={familyName
          ? t('Les véhicules du foyer, un garage par membre.')
          : t('Vos véhicules et leur état d\'entretien.')}
      />

      {error && (
        <div
          className="flex items-center gap-2"
          style={{
            background: 'var(--danger-light)', border: '1px solid var(--danger)',
            color: 'var(--danger)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 14,
          }}
        >
          <Icon name="alertCircle" size={16} />
          {error}
        </div>
      )}

      {showForm && (
        <div className="card">
          <VehicleForm
            onSubmit={handleVehicleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* « Garage de ReNaGe » sur son PROPRE garage n'apprend rien : on sait à
          qui il est. Le nom du propriétaire n'a de valeur que sur les garages
          des autres, où il répond à une vraie question. */}
      <GaragePanel
        title={t('Mes véhicules')}
        owner={currentUser?.display_name}
        count={myVehicles.length}
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className={`btn btn-sm ${showForm ? 'btn-secondary' : 'btn-primary'}`}
          >
            <Icon name={showForm ? 'close' : 'plus'} size={15} strokeWidth={2} />
            {showForm ? t('Annuler') : t('Ajouter')}
          </button>
        }
      >
        {myVehicles.length > 0 ? (
          renderCards(myVehicles)
        ) : (
          // Le cas existe dès qu'on rejoint un groupe avant d'avoir créé son
          // premier véhicule : sans ce message, la page s'ouvre directement
          // sur le garage de quelqu'un d'autre.
          <div className="text-center" style={{ padding: '32px 16px' }}>
            <div className="icon-box lg neutral mx-auto" style={{ marginBottom: 12 }}>
              <Icon name="car" size={20} />
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 14 }}>
              {t('Votre garage est vide pour le moment.')}
            </p>
            {!showForm && (
              <button onClick={() => setShowForm(true)} className="btn btn-primary">
                <Icon name="plus" size={16} strokeWidth={2} />
                {t('Ajouter un véhicule')}
              </button>
            )}
          </div>
        )}
      </GaragePanel>

      {/* Un panneau par membre du groupe famille */}
      {sharedGarages.map((garage) => (
        <GaragePanel
          key={garage.ownerId}
          title={t('Garage de {name}', { name: garage.name || t('un membre du groupe') })}
          owner={garage.name}
          count={garage.vehicles.length}
          badge={
            <span className="badge badge-info">
              <Icon name="eye" size={12} strokeWidth={2} />
              {t('Lecture seule')}
            </span>
          }
          subtitle={t('Partagé avec vous — seul {name} peut y enregistrer un entretien ou un plein.', { name: garage.name || t('son propriétaire') })}
        >
          {renderCards(garage.vehicles)}
        </GaragePanel>
      ))}
    </div>
  );
}
