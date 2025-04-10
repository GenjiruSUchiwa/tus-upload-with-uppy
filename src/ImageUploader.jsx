import React, { useState, useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const ImageUploader = () => {
    const [images, setImages] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [progressInfo, setProgressInfo] = useState({});
    const fileInputRef = useRef(null);
    const uppyRef = useRef(null);
    const uppyFileIdsMapRef = useRef({}); // Pour mapper les IDs pendingFile aux IDs Uppy

    // Référence pour suivre les temps minimums d'affichage de progression
    const progressTimersRef = useRef({});

    // Temps minimum pour afficher la progression (en ms)
    const MIN_PROGRESS_DISPLAY_TIME = 1000;

    // Chemin vers l'image de preview TIFF statique
    const TIFF_PREVIEW_PATH = "/tif-preview.png";

    // Fonction pour vérifier si un fichier est au format TIFF
    const isTiffFile = (file) => {
        return file.type === 'image/tiff' ||
            file.name.toLowerCase().endsWith('.tif') ||
            file.name.toLowerCase().endsWith('.tiff');
    };

    // Fonction pour générer une URL de preview selon le type de fichier
    const getPreviewUrl = (file) => {
        if (isTiffFile(file)) {
            // Pour les TIFF, utiliser l'image statique
            return TIFF_PREVIEW_PATH;
        }
        // Pour les autres formats, utiliser l'URL de l'objet
        return URL.createObjectURL(file);
    };

    // Composant pour le progress circle
    const CircularProgress = ({ percentage }) => {
        const radius = 15;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;

        return (
            <svg className="w-10 h-10" viewBox="0 0 36 36">
                <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    stroke="#e6e6e6"
                    strokeWidth="3"
                />
                <circle
                    cx="18"
                    cy="18"
                    r={radius}
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90 18 18)"
                />
                <text
                    x="18"
                    y="18"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                >
                    {percentage}%
                </text>
            </svg>
        );
    };

    // Composant pour l'icône de succès
    const SuccessIcon = () => (
        <div className="rounded-full bg-green-500 p-1 w-6 h-6 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
        </div>
    );

    // Composant pour l'icône d'échec
    const FailIcon = () => (
        <div className="rounded-full bg-red-500 p-1 w-6 h-6 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </div>
    );

    // Fonction pour finaliser l'upload après le délai minimum si nécessaire
    const finalizeUpload = (file, response, pendingId, fileIsTiff, storageUrl, displayUrl) => {
        // Définir l'index par défaut à la longueur du tableau images
        const matchingPendingFile = pendingFiles.find(pf => pf.id === pendingId);
        const index = matchingPendingFile ? matchingPendingFile.index : images.length;

        // Ajouter l'image à la liste des images téléchargées avec succès
        setImages((prevImages) => [
            ...prevImages,
            {
                id: file.id,
                name: file.name,
                url: displayUrl,           // URL pour l'affichage (preview)
                storageUrl: storageUrl,    // URL réelle pour le stockage/téléchargement
                isTiff: fileIsTiff,
                index,
                uploadSuccess: true,       // Marquer comme réussi
            },
        ]);

        // Supprimer le fichier en attente correspondant
        if (pendingId) {
            setPendingFiles(prev => prev.filter(pf => pf.id !== pendingId));
        }

        // Nettoyer les infos de progression
        setProgressInfo(prev => {
            const newProgress = {...prev};
            if (pendingId) {
                delete newProgress[pendingId];
            }
            return newProgress;
        });

        // Nettoyer le mappage et le timer
        delete uppyFileIdsMapRef.current[file.id];
        delete progressTimersRef.current[pendingId];

        // Vérifier si c'était le dernier fichier en cours d'upload
        const remainingUploads = Object.keys(uppyFileIdsMapRef.current).length;
        if (remainingUploads === 0) {
            setIsUploading(false);
        }
    };

    // Initialisation d'Uppy - une seule fois au montage du composant
    useEffect(() => {
        // Initialiser Uppy seulement s'il n'existe pas encore
        if (!uppyRef.current) {
            uppyRef.current = new Uppy({
                id: "uppy",
                autoProceed: true,
                allowMultipleUploadBatches: true,
                restrictions: {
                    // Inclure explicitement 'image/tiff' dans les types autorisés
                    allowedFileTypes: ["image/*", ".tif", ".tiff", "image/tiff"],
                },
            })
                .use(Tus, {
                    endpoint: "https://tusd.tusdemo.net/files/", // Remplacer par votre endpoint tus
                    retryDelays: [0, 1000, 3000, 5000],
                    chunkSize: 1 * 1024 * 1024,
                });

            // Configuration des événements Uppy une seule fois
            uppyRef.current
                .on('file-added', (file) => {
                    // Stocker la relation entre l'ID Uppy et l'ID pendingFile
                    const pendingId = file.meta.pendingId;
                    if (pendingId) {
                        uppyFileIdsMapRef.current[file.id] = pendingId;

                        // Initialiser la progression à 0 pour assurer l'affichage du cercle de progression
                        setProgressInfo(prev => ({
                            ...prev,
                            [pendingId]: {
                                progress: 0,
                                bytesUploaded: 0,
                                bytesTotal: file.size,
                                uppyFileId: file.id,
                                startTime: Date.now()
                            }
                        }));
                    }
                })
                .on('upload-progress', (file, progress) => {
                    const { bytesUploaded, bytesTotal } = progress;
                    const percentage = Math.floor((bytesUploaded / bytesTotal) * 100);

                    // Trouver l'ID du fichier en attente correspondant
                    const pendingId = uppyFileIdsMapRef.current[file.id];

                    if (pendingId) {
                        // Mettre à jour les infos de progression
                        setProgressInfo(prev => {
                            const currentInfo = prev[pendingId] || {};
                            return {
                                ...prev,
                                [pendingId]: {
                                    ...currentInfo,
                                    progress: percentage,
                                    bytesUploaded,
                                    bytesTotal,
                                    uppyFileId: file.id
                                }
                            };
                        });
                    }
                })
                .on("upload-success", (file, response) => {
                    // Vérifier si c'est un fichier TIFF
                    const fileIsTiff = isTiffFile(file.data);

                    // URL de stockage (URL réelle du fichier téléchargé)
                    const storageUrl = response.uploadURL || URL.createObjectURL(file.data);

                    // URL d'affichage (preview)
                    const displayUrl = fileIsTiff ? TIFF_PREVIEW_PATH : storageUrl;

                    // Trouver l'ID du fichier en attente correspondant
                    const pendingId = uppyFileIdsMapRef.current[file.id];

                    if (pendingId) {
                        // Vérifier si le temps minimal d'affichage de la progression est écoulé
                        const progressInfo = progressTimersRef.current[pendingId] || {};
                        const startTime = progressInfo.startTime || 0;
                        const elapsedTime = Date.now() - startTime;

                        if (elapsedTime < MIN_PROGRESS_DISPLAY_TIME) {
                            // Si l'upload a été trop rapide, attendre un peu avant de finaliser
                            // S'assurer que la progression affiche 100%
                            setProgressInfo(prev => ({
                                ...prev,
                                [pendingId]: {
                                    ...prev[pendingId],
                                    progress: 100
                                }
                            }));

                            // Définir un timer pour finaliser l'upload après le délai minimum
                            const remainingTime = MIN_PROGRESS_DISPLAY_TIME - elapsedTime;
                            const timerId = setTimeout(() => {
                                finalizeUpload(file, response, pendingId, fileIsTiff, storageUrl, displayUrl);
                            }, remainingTime);

                            // Stocker le timer ID pour pouvoir le nettoyer si nécessaire
                            progressTimersRef.current[pendingId] = {
                                ...progressTimersRef.current[pendingId],
                                timerId
                            };
                        } else {
                            // Si suffisamment de temps s'est écoulé, finaliser immédiatement
                            finalizeUpload(file, response, pendingId, fileIsTiff, storageUrl, displayUrl);
                        }
                    } else {
                        // Si pas de pendingId (cas rare), finaliser directement
                        finalizeUpload(file, response, null, fileIsTiff, storageUrl, displayUrl);
                    }
                })
                .on("upload-error", (file, error) => {
                    console.error("Upload error:", error);

                    // Trouver l'ID du fichier en attente correspondant
                    const pendingId = uppyFileIdsMapRef.current[file.id];

                    // Marquer le fichier comme ayant échoué
                    if (pendingId) {
                        setPendingFiles(prev => prev.map(pf => {
                            if (pf.id === pendingId) {
                                return {...pf, uploadFailed: true};
                            }
                            return pf;
                        }));

                        // Nettoyer les infos de progression
                        setProgressInfo(prev => {
                            const newProgress = {...prev};
                            delete newProgress[pendingId];
                            return newProgress;
                        });

                        // Nettoyer le timer si existant
                        if (progressTimersRef.current[pendingId]?.timerId) {
                            clearTimeout(progressTimersRef.current[pendingId].timerId);
                            delete progressTimersRef.current[pendingId];
                        }
                    }

                    // Nettoyer le mappage
                    delete uppyFileIdsMapRef.current[file.id];

                    // Vérifier s'il reste des uploads en cours
                    const remainingUploads = Object.keys(uppyFileIdsMapRef.current).length;
                    if (remainingUploads === 0) {
                        setIsUploading(false);
                    }
                })
                .on("complete", (result) => {
                    // La gestion du statut d'upload est maintenant déléguée aux handlers individuels
                    // pour une meilleure gestion des délais d'affichage
                });
        }

        // Nettoyer Uppy et les URL des objets lors du démontage
        return () => {
            if (uppyRef.current) {
                uppyRef.current.destroy();
                uppyRef.current = null;
            }

            // Nettoyer les URL d'objets pour éviter les fuites de mémoire
            pendingFiles.forEach(file => {
                if (file.url && file.url.startsWith('blob:')) {
                    URL.revokeObjectURL(file.url);
                }
            });

            // Nettoyer tous les timers en cours
            Object.values(progressTimersRef.current).forEach(info => {
                if (info.timerId) {
                    clearTimeout(info.timerId);
                }
            });

            // Réinitialiser les références
            uppyFileIdsMapRef.current = {};
            progressTimersRef.current = {};
        };
    }, []); // Dépendance vide - s'exécute uniquement au montage et au démontage

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (event) => {
        const files = event.target.files;

        if (files.length > 0) {
            setIsUploading(true);

            // Créer des aperçus locaux pour les fichiers sélectionnés
            const newPendingFiles = Array.from(files).map(file => {
                const id = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Vérifier si c'est un fichier TIFF
                const fileIsTiff = isTiffFile(file);

                // Obtenir l'URL de preview appropriée selon le type de fichier
                const previewUrl = getPreviewUrl(file);

                // Enregistrer l'heure de début pour mesurer la durée d'affichage minimale
                progressTimersRef.current[id] = {
                    startTime: Date.now()
                };

                return {
                    id: id,
                    name: file.name,
                    url: previewUrl,
                    file: file,
                    isPending: true,
                    isTiff: fileIsTiff,
                    index: pendingFiles.length + images.length,
                };
            });

            // Mettre à jour l'état avec les nouveaux fichiers en attente
            setPendingFiles(prevPendingFiles => [...prevPendingFiles, ...newPendingFiles]);

            // Ajouter les fichiers à Uppy après avoir mis à jour l'état
            setTimeout(() => {
                // Utiliser setTimeout pour s'assurer que l'état est bien mis à jour
                newPendingFiles.forEach(pendingFile => {
                    try {
                        uppyRef.current.addFile({
                            name: pendingFile.name,
                            type: pendingFile.file.type || 'image/tiff', // Assurer un type même pour les fichiers sans type détecté
                            data: pendingFile.file,
                            meta: {
                                pendingId: pendingFile.id,
                                index: pendingFile.index,
                                isTiff: pendingFile.isTiff
                            }
                        });
                    } catch (error) {
                        console.error("Erreur lors de l'ajout du fichier à Uppy:", error);
                        // Marquer le fichier comme ayant échoué
                        setPendingFiles(prev => prev.map(pf => {
                            if (pf.id === pendingFile.id) {
                                return { ...pf, uploadFailed: true };
                            }
                            return pf;
                        }));

                        // Nettoyer le timer si existant
                        if (progressTimersRef.current[pendingFile.id]) {
                            delete progressTimersRef.current[pendingFile.id];
                        }

                        // Vérifier s'il reste des uploads en cours
                        const remainingPendingFiles = prev.filter(pf => !pf.uploadFailed).length - 1;
                        if (remainingPendingFiles <= 0) {
                            setIsUploading(false);
                        }
                    }
                });
            }, 0);
        }

        // Réinitialiser l'input file pour permettre la sélection du même fichier
        event.target.value = "";
    };

    const handleDragEnd = (result) => {
        if (!result.destination) return;

        // Combiner les images téléchargées et en attente pour le réordonnancement
        const allItems = [...images, ...pendingFiles];
        const items = Array.from(allItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Mettre à jour les indices après réorganisation et séparer à nouveau les listes
        const updatedItems = items.map((item, index) => ({
            ...item,
            index,
        }));

        // Séparer les images téléchargées et en attente
        const updatedImages = updatedItems.filter(item => !item.isPending);
        const updatedPendingFiles = updatedItems.filter(item => item.isPending);

        setImages(updatedImages);
        setPendingFiles(updatedPendingFiles);
    };

    const handleCreateExperiment = () => {
        // S'il n'y a plus de fichiers en attente, créer l'expérience
        console.log("Images ordonnées:", images);
        // Appel API ou autre logique ici
    };

    // Fonction pour rendre la grille d'images
    const renderImageGrid = () => {
        // Combiner les images déjà téléchargées et celles en attente
        const allImages = [...images, ...pendingFiles];

        // Trier par index pour maintenir l'ordre
        allImages.sort((a, b) => a.index - b.index);

        // Si aucune image, ne pas rendre le système de drag and drop
        if (allImages.length === 0) {
            return (
                <div className="empty-state">
                    <p className="text-gray-600 text-center">No images selected yet. Select some images to begin.</p>
                </div>
            );
        }

        return (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable
                    droppableId="images"
                    direction="horizontal"
                    isDropDisabled={false}
                    isCombineEnabled={false}
                    ignoreContainerClipping={false}
                    type="DEFAULT"
                >
                    {(provided, snapshot) => (
                        <div
                            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-8 max-h-[500px] overflow-y-auto p-1 ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {allImages.map((image, index) => {
                                // Trouver les informations de progression pour ce fichier
                                const progress = progressInfo[image.id] || { progress: 0 };
                                const showProgressCircle = image.isPending && !image.uploadFailed;

                                return (
                                    <Draggable
                                        key={String(image.id)}
                                        draggableId={String(image.id)}
                                        index={index}
                                        isDragDisabled={showProgressCircle}
                                        disableInteractiveElementBlocking={true}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                className={`relative rounded-lg overflow-hidden bg-gray-100 shadow cursor-grab flex flex-col ${snapshot.isDragging ? 'shadow-md' : 'shadow-sm'}`}
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                style={{
                                                    ...provided.draggableProps.style
                                                }}
                                            >
                                                <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
                                                    {String(index + 1).padStart(2, '0')}
                                                </div>
                                                <div className="w-full h-[100px] overflow-hidden relative">
                                                    <img
                                                        src={image.url}
                                                        alt={image.name}
                                                        className="w-full h-full object-cover"
                                                    />

                                                    {/* Badge TIFF si nécessaire */}
                                                    {image.isTiff && (
                                                        <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                                                            TIFF
                                                        </div>
                                                    )}

                                                    {/* Affichage progress circle */}
                                                    {showProgressCircle && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                                            <CircularProgress percentage={progress.progress || 0} />
                                                        </div>
                                                    )}

                                                    {/* Icône de succès pour les uploads terminés */}
                                                    {image.uploadSuccess && (
                                                        <div className="absolute bottom-2 right-2">
                                                            <SuccessIcon />
                                                        </div>
                                                    )}

                                                    {/* Icône d'échec pour les uploads échoués */}
                                                    {image.uploadFailed && (
                                                        <div className="absolute bottom-2 right-2">
                                                            <FailIcon />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-600 p-1 whitespace-nowrap overflow-hidden text-ellipsis bg-gray-100">
                                                    {image.name}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    };

    // Debug pour voir la progression en console
    useEffect(() => {
        console.log("Progression des uploads:", progressInfo);
    }, [progressInfo]);

    return (
        <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-[900px] mx-auto p-5 relative">
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-medium m-0 text-gray-800">Upload images</h2>
                <button className="bg-transparent border-0 text-2xl cursor-pointer text-gray-400">&times;</button>
            </div>

            <p className="text-gray-600 mb-5 text-sm">
                Please make sure your images are correctly ordered according to your experiment setup
            </p>

            {/* Rendu de la grille d'images */}
            {renderImageGrid()}

            <div className="flex justify-center mb-5">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    multiple
                    accept="image/*,.tif,.tiff"
                />
                <button
                    className="flex items-center justify-center bg-white border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 cursor-pointer transition hover:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed before:content-['↑'] before:mr-2"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading..." : "Select more images"}
                </button>
            </div>

            <button
                className="block w-full bg-blue-500 text-white border-0 rounded py-3 text-base font-medium cursor-pointer transition hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
                onClick={handleCreateExperiment}
                disabled={(images.length === 0 && pendingFiles.length === 0) || isUploading}
            >
                {isUploading ? "Uploading..." : "Create Experiment"}
            </button>
        </div>
    );
};

export default ImageUploader;