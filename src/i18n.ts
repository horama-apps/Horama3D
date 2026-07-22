import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  es: {
    translation: {
      brand: { title: 'Horama Configurator' },
      language: { label: 'Idioma', es: 'Español', en: 'English', fr: 'Français' },
      configurator: {
        label: 'Tipo de configurador',
        stl: 'STL',
        image: 'IMG a STL',
        create: 'Crear desde cero',
      },
      common: {
        generate: 'Generar', reset: 'Restablecer', download: 'Descargar',
        show: 'Mostrar', hide: 'Ocultar', setup: 'Configuración',
        finishing: 'Acabado', customization: 'Personalización', transformInfo: 'Información de transformación',
        wip: 'WIP', workInProgress: 'trabajo en progreso', objects: 'Objetos',
      },
      products: {
        lamp: { name: 'Lámparas', description: 'Convierte modelos STL en lámparas con el mecanismo fijo de Horama.' },
        urn: { name: 'Urnas', description: 'Ajustes de transformación para el flujo de urnas STL.' },
        clicker: { name: 'Clickers', description: 'Cuerpo, tapa, espacio del interruptor y opciones de llavero.' },
        textures: { name: 'Texturas', description: 'Patrones de superficie imprimibles con relieve.' },
        keychains: { name: 'Llaveros', description: 'Herramientas independientes para llaveros próximamente.' },
        image_layers: { name: 'Imagen a capas', description: 'Convierte una imagen en capas de profundidad imprimibles.' },
        signs: { name: 'Letreros', description: 'Letreros personalizados con fuentes locales, paredes huecas y texturas.' },
      },
      params: {
        size: { label: 'Tamaño' }, lid_text: { label: 'Texto de la tapa' },
        body_color: { label: 'Color del cuerpo' }, base_color: { label: 'Color de la base' }, lid_color: { label: 'Color de la tapa' }, text_color: { label: 'Color del texto' },
        base_thickness_mm: { label: 'Grosor de la base' }, inner_scale: { label: 'Escala interior' }, planar_cut_base_mm: { label: 'Corte de base' },
        connector_margin_mm: { label: 'Margen del conector' }, part_gap_mm: { label: 'Separación de piezas' },
        cut_height_mm: { label: 'Altura de corte' }, base_protrusion_mm: { label: 'Saliente de la base' },
        bottom_color: { label: 'Color inferior' }, top_color: { label: 'Color superior' },
        keychain_hole: { label: 'Orificio para llavero' }, keychain_hole_placement: { label: 'Ubicación del llavero' },
        keychain_hole_angle_deg: { label: 'Posición del orificio' }, keychain_hole_inset_mm: { label: 'Mover hacia el origen' },
        texture: { label: 'Textura' }, texture_depth_mm: { label: 'Profundidad de textura' }, texture_spacing_mm: { label: 'Espaciado del patrón' },
        text: { label: 'Texto del letrero' }, font: { label: 'Fuente' }, font_size_mm: { label: 'Tamaño de letra' },
        letter_spacing_mm: { label: 'Espaciado entre letras' }, line_spacing_mm: { label: 'Espaciado entre líneas' },
        hollow: { label: 'Letras huecas', help: 'Conserva una base delgada y paredes perimetrales para usar menos material.' },
        mounting_holes: { label: 'Orificios ciegos de montaje', help: 'Añade una cavidad ciega detrás de cada letra para montarla de forma equilibrada.' },
        mounting_hole_diameter_mm: { label: 'Diámetro del orificio' },
        mounting_hole_depth_mm: { label: 'Profundidad del orificio', help: 'La cavidad permanece ciega y conserva una superficie frontal sólida.' },
        wall_thickness_mm: { label: 'Grosor de pared' }, wall_height_mm: { label: 'Altura de pared' },
      },
      options: {
        size: { s: 'Pequeña - 250 ml', m: 'Mediana - 500 ml', l: 'Grande - 1000 ml', xl: 'XL - 2000 ml' },
        keychain_hole_placement: { bottom: 'Base inferior', top: 'Objeto superior' },
        texture: { none: 'Ninguna', woven: 'Tejido', knit: 'Punto', carbon: 'Fibra de carbono', wood: 'Madera' },
      },
      placeholders: { lidText: 'agrega el texto de la tapa', signText: 'Escribe el texto del letrero' },
      upload: { load: 'Cargar STL', analyzing: 'Analizando STL', select: 'Selecciona un STL local para previsualizar.' },
      status: {
        checkingStp: 'Comprobando STP', stpApi: 'Estado de API STP', localGenerator: 'Generador local', imageWorkflow: 'Flujo de imagen',
        loadStl: 'Carga un STL para inspeccionarlo en el visor', loadValidStl: 'Carga un STL válido para desbloquear la vista 3D.',
        configureSign: 'Configura el letrero y genera una vista previa.', imageWip: 'Este módulo de imagen sigue en desarrollo.', moduleWip: 'Este módulo sigue en desarrollo.',
        parametersUpdated: 'Parámetros actualizados', stlReady: 'STL cargado. Los parámetros están listos para la API STP.',
        generatingSign: 'Generando el letrero localmente...', generatingStp: 'Generando mediante el flujo STP...', generated: 'Modelo generado cargado', generationFailed: 'La generación falló',
        movingHole: 'Actualizando la posición del orificio...', holeMoved: 'Posición del orificio actualizada', holeMoveFailed: 'No se pudo mover el orificio',
        defaultsRestored: 'Valores predeterminados restaurados', generatingPreview: 'Generando vista previa',
        preparingStl: 'Preparando STL...', preparingZip: 'Preparando ZIP de STL...', preparing3mf: 'Preparando 3MF con materiales de vista previa...',
        downloaded: 'Descargado: {{filename}}', downloadFailed: 'La descarga falló', loaded: '{{filename}} cargado',
      },
      alerts: { moveHoles: 'Mueve los círculos rojos para elegir la posición de cada orificio.' },
      messages: { transformWarnings: 'Advertencias de transformación', validationWarnings: 'Advertencias de validación', validationIssues: 'Problemas de validación', invalidStl: 'El modelo STL no es válido.', rejectedStl: 'Modelo rechazado. Carga un STL válido para continuar.', validStl: 'El archivo STL se cargó correctamente.', validateFailed: 'No se pudo validar el modelo. Inténtalo de nuevo.', missingApi: 'Configura VITE_STP_API_BASE_URL o carga un STL manualmente.' },
      viewer: { front: 'Ver frente', mounting: 'Ver lado de montaje', actions: 'Acciones del visor' },
      notes: { clickerReset: 'Después de generar, usa Restablecer para volver al STL original y mostrar nuevamente el plano de corte Z.' },
      info: { size: 'Tamaño', targetCapacity: 'Capacidad objetivo', estimatedCapacity: 'Capacidad estimada', appliedScale: 'Escala aplicada', cutHeight: 'Altura de corte', attachmentCenter: 'Centro del mecanismo', attachmentClearance: 'Despeje del mecanismo', effectiveWall: 'Pared efectiva' },
    },
  },
  en: {
    translation: {
      brand: { title: 'Horama Configurator' },
      language: { label: 'Language', es: 'Español', en: 'English', fr: 'Français' },
      configurator: { label: 'Configurator type', stl: 'STL', image: 'IMG to STL', create: 'Create from Scratch' },
      common: { generate: 'Generate', reset: 'Reset', download: 'Download', show: 'Show', hide: 'Hide', setup: 'Setup', finishing: 'Finishing', customization: 'Customization', transformInfo: 'Transform info', wip: 'WIP', workInProgress: 'work in progress', objects: 'Objects' },
      products: {
        lamp: { name: 'Lamps', description: 'Turn STL models into lamps with the fixed Horama mechanism.' },
        urn: { name: 'Urns', description: 'Urn transform settings from the STL workflow.' },
        clicker: { name: 'Clickers', description: 'Button body, cap size, switch clearance, and keychain options.' },
        textures: { name: 'Textures', description: 'Raised printable surface patterns.' },
        keychains: { name: 'Keychains', description: 'Standalone keychain tools coming soon.' },
        image_layers: { name: 'Image to Layers', description: 'Convert an image into separated printable depth layers.' },
        signs: { name: 'Signs', description: 'Custom letter signs with local fonts, hollow walls, and textures.' },
      },
      params: {
        size: { label: 'Size' }, lid_text: { label: 'Lid text' }, body_color: { label: 'Body color' }, base_color: { label: 'Base color' }, lid_color: { label: 'Lid color' }, text_color: { label: 'Text color' },
        base_thickness_mm: { label: 'Base thickness' }, inner_scale: { label: 'Inner scale' }, planar_cut_base_mm: { label: 'Base cut' }, connector_margin_mm: { label: 'Connector margin' }, part_gap_mm: { label: 'Part gap' }, cut_height_mm: { label: 'Cut height' }, base_protrusion_mm: { label: 'Base protrusion' },
        bottom_color: { label: 'Bottom color' }, top_color: { label: 'Top color' }, keychain_hole: { label: 'Keychain hole' }, keychain_hole_placement: { label: 'Keychain placement' }, keychain_hole_angle_deg: { label: 'Hole position' }, keychain_hole_inset_mm: { label: 'Move toward origin' },
        texture: { label: 'Texture' }, texture_depth_mm: { label: 'Texture depth' }, texture_spacing_mm: { label: 'Pattern spacing' }, text: { label: 'Sign text' }, font: { label: 'Font' }, font_size_mm: { label: 'Letter size' }, letter_spacing_mm: { label: 'Letter spacing' }, line_spacing_mm: { label: 'Line spacing' },
        hollow: { label: 'Hollow letters', help: 'Keeps a thin base and perimeter walls so the letters use less material.' },
        mounting_holes: { label: 'Blind mounting holes', help: 'Adds a centered blind cavity behind each letter for balanced mounting.' }, mounting_hole_diameter_mm: { label: 'Hole diameter' }, mounting_hole_depth_mm: { label: 'Hole depth', help: 'The cavity stays blind and always keeps a solid front skin.' }, wall_thickness_mm: { label: 'Wall thickness' }, wall_height_mm: { label: 'Wall height' },
      },
      options: { size: { s: 'Small - 250 ml', m: 'Medium - 500 ml', l: 'Large - 1000 ml', xl: 'XL - 2000 ml' }, keychain_hole_placement: { bottom: 'Bottom base', top: 'Top object' }, texture: { none: 'None', woven: 'Woven', knit: 'Knit', carbon: 'Carbon', wood: 'Wood' } },
      placeholders: { lidText: 'add your lid text here', signText: 'Type the sign text' },
      upload: { load: 'Load STL', analyzing: 'Analyzing STL', select: 'Select a local STL to preview.' },
      status: { checkingStp: 'Checking STP', stpApi: 'STP API Status', localGenerator: 'Local generator', imageWorkflow: 'Image workflow', loadStl: 'Load an STL to inspect it in the viewer', loadValidStl: 'Load a valid STL to unlock the 3D preview.', configureSign: 'Configure the sign and generate a preview.', imageWip: 'This image module is still in progress.', moduleWip: 'This module is still in progress.', parametersUpdated: 'Parameters updated', stlReady: 'STL loaded. Parameters are ready for the STP API.', generatingSign: 'Generating sign locally...', generatingStp: 'Generating through STP pipeline...', generated: 'Generated model loaded', generationFailed: 'Generation failed', movingHole: 'Updating mounting hole position...', holeMoved: 'Mounting hole position updated', holeMoveFailed: 'Could not move the mounting hole', defaultsRestored: 'Defaults restored', generatingPreview: 'Generating preview', preparingStl: 'Preparing STL...', preparingZip: 'Preparing STL ZIP...', preparing3mf: 'Preparing 3MF with preview materials...', downloaded: 'Downloaded {{filename}}', downloadFailed: 'Download failed', loaded: 'Loaded {{filename}}' },
      alerts: { moveHoles: 'Move the red circle indicators to choose each hole position.' },
      messages: { transformWarnings: 'Transform warnings', validationWarnings: 'Validation warnings', validationIssues: 'Validation issues', invalidStl: 'The STL model is not valid.', rejectedStl: 'Model rejected. Load a valid STL to continue.', validStl: 'The STL file can be loaded correctly.', validateFailed: 'Could not validate the model. Try again.', missingApi: 'Add VITE_STP_API_BASE_URL or load an STL manually.' },
      viewer: { front: 'View front', mounting: 'View mounting side', actions: 'Viewer actions' },
      notes: { clickerReset: 'After generating, use Reset to return to the original STL and show the Z cut plane again.' },
      info: { size: 'Size', targetCapacity: 'Target capacity', estimatedCapacity: 'Estimated capacity', appliedScale: 'Applied scale', cutHeight: 'Cut height', attachmentCenter: 'Mechanism center', attachmentClearance: 'Mechanism clearance', effectiveWall: 'Effective wall' },
    },
  },
  fr: {
    translation: {
      brand: { title: 'Configurateur Horama' },
      language: { label: 'Langue', es: 'Español', en: 'English', fr: 'Français' },
      configurator: { label: 'Type de configurateur', stl: 'STL', image: 'IMG vers STL', create: 'Créer de zéro' },
      common: { generate: 'Générer', reset: 'Réinitialiser', download: 'Télécharger', show: 'Afficher', hide: 'Masquer', setup: 'Configuration', finishing: 'Finition', customization: 'Personnalisation', transformInfo: 'Informations de transformation', wip: 'WIP', workInProgress: 'travail en cours', objects: 'Objets' },
      products: {
        lamp: { name: 'Lampes', description: 'Transforme les modèles STL en lampes avec le mécanisme Horama fixe.' },
        urn: { name: 'Urnes', description: 'Réglages de transformation des urnes pour le flux STL.' },
        clicker: { name: 'Clickers', description: 'Corps, capuchon, dégagement de l’interrupteur et options de porte-clés.' },
        textures: { name: 'Textures', description: 'Motifs de surface imprimables en relief.' },
        keychains: { name: 'Porte-clés', description: 'Outils autonomes pour porte-clés bientôt disponibles.' },
        image_layers: { name: 'Image en couches', description: 'Convertit une image en couches de profondeur imprimables.' },
        signs: { name: 'Enseignes', description: 'Lettres personnalisées avec polices locales, parois creuses et textures.' },
      },
      params: {
        size: { label: 'Taille' }, lid_text: { label: 'Texte du couvercle' }, body_color: { label: 'Couleur du corps' }, base_color: { label: 'Couleur de la base' }, lid_color: { label: 'Couleur du couvercle' }, text_color: { label: 'Couleur du texte' },
        base_thickness_mm: { label: 'Épaisseur de la base' }, inner_scale: { label: 'Échelle intérieure' }, planar_cut_base_mm: { label: 'Coupe de la base' }, connector_margin_mm: { label: 'Marge du connecteur' }, part_gap_mm: { label: 'Écart entre les pièces' }, cut_height_mm: { label: 'Hauteur de coupe' }, base_protrusion_mm: { label: 'Saillie de la base' },
        bottom_color: { label: 'Couleur inférieure' }, top_color: { label: 'Couleur supérieure' }, keychain_hole: { label: 'Trou de porte-clés' }, keychain_hole_placement: { label: 'Emplacement du porte-clés' }, keychain_hole_angle_deg: { label: 'Position du trou' }, keychain_hole_inset_mm: { label: 'Déplacer vers l’origine' },
        texture: { label: 'Texture' }, texture_depth_mm: { label: 'Profondeur de texture' }, texture_spacing_mm: { label: 'Espacement du motif' }, text: { label: 'Texte de l’enseigne' }, font: { label: 'Police' }, font_size_mm: { label: 'Taille des lettres' }, letter_spacing_mm: { label: 'Espacement des lettres' }, line_spacing_mm: { label: 'Espacement des lignes' },
        hollow: { label: 'Lettres creuses', help: 'Conserve une base fine et des parois périphériques pour utiliser moins de matière.' },
        mounting_holes: { label: 'Trous de montage borgnes', help: 'Ajoute une cavité borgne derrière chaque lettre pour un montage équilibré.' }, mounting_hole_diameter_mm: { label: 'Diamètre du trou' }, mounting_hole_depth_mm: { label: 'Profondeur du trou', help: 'La cavité reste borgne et conserve une face avant solide.' }, wall_thickness_mm: { label: 'Épaisseur de paroi' }, wall_height_mm: { label: 'Hauteur de paroi' },
      },
      options: { size: { s: 'Petite - 250 ml', m: 'Moyenne - 500 ml', l: 'Grande - 1000 ml', xl: 'XL - 2000 ml' }, keychain_hole_placement: { bottom: 'Base inférieure', top: 'Objet supérieur' }, texture: { none: 'Aucune', woven: 'Tissé', knit: 'Tricot', carbon: 'Carbone', wood: 'Bois' } },
      placeholders: { lidText: 'ajoutez le texte du couvercle', signText: 'Saisissez le texte de l’enseigne' },
      upload: { load: 'Charger un STL', analyzing: 'Analyse du STL', select: 'Sélectionnez un STL local à prévisualiser.' },
      status: { checkingStp: 'Vérification STP', stpApi: 'État de l’API STP', localGenerator: 'Générateur local', imageWorkflow: 'Flux d’image', loadStl: 'Chargez un STL pour l’inspecter', loadValidStl: 'Chargez un STL valide pour déverrouiller la vue 3D.', configureSign: 'Configurez l’enseigne et générez un aperçu.', imageWip: 'Ce module d’image est encore en développement.', moduleWip: 'Ce module est encore en développement.', parametersUpdated: 'Paramètres mis à jour', stlReady: 'STL chargé. Les paramètres sont prêts pour l’API STP.', generatingSign: 'Génération locale de l’enseigne...', generatingStp: 'Génération via le flux STP...', generated: 'Modèle généré chargé', generationFailed: 'Échec de la génération', movingHole: 'Mise à jour de la position du trou...', holeMoved: 'Position du trou mise à jour', holeMoveFailed: 'Impossible de déplacer le trou', defaultsRestored: 'Valeurs par défaut restaurées', generatingPreview: 'Génération de l’aperçu', preparingStl: 'Préparation du STL...', preparingZip: 'Préparation du ZIP STL...', preparing3mf: 'Préparation du 3MF avec les matériaux...', downloaded: '{{filename}} téléchargé', downloadFailed: 'Échec du téléchargement', loaded: '{{filename}} chargé' },
      alerts: { moveHoles: 'Déplacez les cercles rouges pour choisir la position de chaque trou.' },
      messages: { transformWarnings: 'Avertissements de transformation', validationWarnings: 'Avertissements de validation', validationIssues: 'Problèmes de validation', invalidStl: 'Le modèle STL n’est pas valide.', rejectedStl: 'Modèle rejeté. Chargez un STL valide pour continuer.', validStl: 'Le fichier STL a été chargé correctement.', validateFailed: 'Impossible de valider le modèle. Réessayez.', missingApi: 'Configurez VITE_STP_API_BASE_URL ou chargez un STL manuellement.' },
      viewer: { front: 'Voir l’avant', mounting: 'Voir le côté montage', actions: 'Actions de la visionneuse' },
      notes: { clickerReset: 'Après la génération, utilisez Réinitialiser pour revenir au STL original et afficher le plan de coupe Z.' },
      info: { size: 'Taille', targetCapacity: 'Capacité cible', estimatedCapacity: 'Capacité estimée', appliedScale: 'Échelle appliquée', cutHeight: 'Hauteur de coupe', attachmentCenter: 'Centre du mécanisme', attachmentClearance: 'Dégagement du mécanisme', effectiveWall: 'Paroi effective' },
    },
  },
} as const;

const storedLanguage = window.localStorage.getItem('horama-language');
const initialLanguage = storedLanguage && ['es', 'en', 'fr'].includes(storedLanguage)
  ? storedLanguage
  : 'es';

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLanguage;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language.split('-')[0];
});

export default i18n;
