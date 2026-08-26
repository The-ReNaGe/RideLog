import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Affiche la photo d'un véhicule.
 *
 * `GET /vehicles/{id}/photo` exige un JWT depuis qu'il n'est plus public, et un
 * `<img src>` n'envoie pas d'en-tête Authorization. On charge donc l'image via
 * le client Axios (qui porte le token) et on l'affiche depuis une object URL,
 * révoquée au démontage pour ne pas fuiter de mémoire.
 *
 * `version` sert à recharger après un remplacement de photo : l'URL de
 * l'endpoint ne change pas, on lui passe donc `vehicle.updated_at`.
 *
 * `backdrop` ajoute une doublure floutée de la même image derrière elle. La
 * photo est affichée entière (`object-fit: contain`) : sans cette doublure, une
 * photo qui n'a pas le format du bandeau laisse deux aplats gris sur les côtés.
 */
export default function VehiclePhoto({ vehicleId, version, alt, className, style, backdrop = false }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    api.getVehiclePhotoBlob(vehicleId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        // 404 (pas de photo) ou erreur réseau : on n'affiche simplement rien.
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [vehicleId, version]);

  if (!src) return null;

  return (
    <>
      {backdrop && <img src={src} alt="" aria-hidden="true" className="photo-backdrop" />}
      <img src={src} alt={alt} className={className} style={style} />
    </>
  );
}
