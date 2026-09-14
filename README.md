# Iner Studio

Prototype de logiciel d'interior design avec image 360 et construction 3D.

## Fonctionnalites

- Nouveau projet, ouverture et sauvegarde au format `.inrproject`
- Import d'une image panorama 360 equirectangulaire
- Import d'un plan 2D comme reference de tracage
- Conversion d'un trace 2D en murs, portes et fenetres 3D
- Styles predefinis : American, Europe, Industrial beton, Mediterranean
- Materiaux proceduraux : peinture, beton, beton arme, brique, bois, carrelage, verre, metal, tissu
- Vue 3D, vue 360 et vue split
- Construction rapide d'une piece avec largeur, profondeur et hauteur
- Ajout d'objets simples : cube, sofa, table, lamp, mur, fenetre
- Bibliotheque d'equipements : meuble TV, TV, frigo, four, lave-linge, plaque, porte, fenetre, poignees, rideaux, spot, escalier, toilette, lavabo, douche, baignoire
- Selection, deplacement, duplication, suppression et edition des dimensions
- Export OBJ pour Cinema 4D, Blender ou un autre outil 3D

## Lancer

```bash
node server.js
```

Puis ouvrir `http://localhost:4173`.

## Prochaines etapes conseillees

- Ajouter un moteur de plan 2D avec murs connectes
- Ajouter detection automatique des murs depuis une image de plan 2D
- Ajouter import/export GLB, FBX ou USDZ
- Ajouter textures, bibliotheque de materiaux et catalogue mobilier
- Ajouter generation de modele 3D depuis image 360 via un pipeline IA
- Emballer l'app avec Electron ou Tauri pour obtenir un vrai logiciel desktop
