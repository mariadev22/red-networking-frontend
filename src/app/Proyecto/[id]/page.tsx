"use client";
/// <reference types="react" />
import React from "react";
import axios from "axios";
import { API_ENDPOINTS } from "@/config/env";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Image from "next/image";
import { Github, Download } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircleMore, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ProjectDropDownActions from "@/components/misc/ProjectDropDownActions";
import { toast } from "sonner";

interface Proyecto {
  _id: string;
  title: string;
  description: string;
  authors: string[];
  tags: string[];
  tools: string[];
  repositoryLink: string;
  image: string;
  document: string;
  puntuacion: number[];
  comments: string[];
  date: string;
}

interface Comment {
  _id: string;
  content: string;
  author: string;
  authorID?: string; // Add authorID field from backend
  authorAvatar?: string;
  date: string;
  createdAt?: string;
  likes: string[];
  replies?: Comment[];
}

async function getProyecto(id: string): Promise<Proyecto | null> {
  try {
    const res = await axios.get(API_ENDPOINTS.PROJECT_DETAILS(id));
    if (!res.data || !res.data.proyecto) return null;
    return res.data.proyecto;
  } catch {
    return null;
  }
}

// Función para obtener nombres de autores
async function getAuthorNames(authorIds: string[]): Promise<string[]> {
  try {
    const response = await axios.get(
      "https://red-networking-backend.vercel.app/auth/users"
    );
    const users: { _id: string; name: string }[] = response.data.users || [];
    
    return authorIds.map((id) => {
      const user = users.find((u) => u._id === id);
      return user ? user.name : "Usuario desconocido";
    });
  } catch (error: unknown) {
    console.error("Error obteniendo nombres de autores:", error);
    return authorIds.map(() => "Usuario desconocido");
  }
}
export default function ProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [authorNames, setAuthorNames] = useState<string[]>([]);
  const [commentAuthorNames, setCommentAuthorNames] = useState<{ [key: string]: string }>({});
  const [iaSummary, setIaSummary] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const isAuthor = !!proyecto?.authors?.includes(user?.id ?? "");
  useEffect(() => {
    const fetchProyecto = async () => {
      setIsLoadingProject(true);
      try {
        const p = await getProyecto(id);
        setProyecto(p);
        if (p) {
          const names = await getAuthorNames(p.authors || []);
          setAuthorNames(names);
        }
        // Resetear estados de imagen cuando cambie el proyecto
        setImageLoading(false);
        setImageError(false);
      } catch (error) {
        console.error("Error loading project:", error);
      } finally {
        setIsLoadingProject(false);
      }
    };
    fetchProyecto();
  }, [id]);

  useEffect(() => {
    const fetchComments = async () => {
      setIsLoadingComments(true);
      setCommentsError(null);
      
      try {
        const response = await axios.get(API_ENDPOINTS.PROJECT_COMMENTS(id));
        const commentsData = Array.isArray(response.data.comentarios)
          ? response.data.comentarios
          : [];
        setComments(commentsData);
        
        // Obtener nombres de autores de los comentarios
        if (commentsData.length > 0) {
          try {
            // Intentar obtener nombres directamente del backend
            const authorIds = [...new Set(commentsData.map((comment: Comment) => comment.authorID || comment.author))];
            console.log('Unique author IDs:', authorIds);
            
            const authorNamesMap: { [key: string]: string } = {};
            
            // Para cada autor único, intentar obtener su información
            for (const authorId of authorIds) {
              if (!authorId || typeof authorId !== 'string') {
                console.warn(`Invalid authorId: ${authorId}`);
                authorNamesMap[authorId as string] = "Usuario desconocido";
                continue;
              }

              try {
                const userResponse = await axios.get(
                  `https://red-networking-backend.vercel.app/api/getUser/${authorId}`,
                  { timeout: 5000 }
                );
                console.log(`User response for ${authorId}:`, userResponse.data);
                
                if (userResponse.data && userResponse.data.user) {
                  authorNamesMap[authorId as string] = userResponse.data.user.name || "Usuario desconocido";
                } else if (userResponse.data && userResponse.data.name) {
                  authorNamesMap[authorId as string] = userResponse.data.name;
                } else {
                  authorNamesMap[authorId as string] = "Usuario desconocido";
                }
              } catch (error: unknown) {
                console.error(`Error getting user ${authorId}:`, error);
                authorNamesMap[authorId as string] = "Usuario desconocido";
              }
            }
            
            console.log('Final author names map:', authorNamesMap);
            setCommentAuthorNames(authorNamesMap);
          } catch (error) {
            console.error("Error obteniendo nombres de autores de comentarios:", error);
            // No fallar completamente si hay error obteniendo nombres
            setCommentAuthorNames({});
          }
        }
      } catch (error) {
        console.error("Error cargando comentarios:", error);
        setCommentsError("Error al cargar los comentarios");
        setComments([]);
        toast.error("Error al cargar los comentarios");
      } finally {
        setIsLoadingComments(false);
      }
    };
    fetchComments();
  }, [id]);

  // Nueva función para generar el resumen IA bajo demanda
  const handleGenerateSummary = () => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    setIaSummary(null);
    axios
      .get(`https://red-networking-backend.vercel.app/api/resumen-ia/${id}`)
      .then((res) => {
        if (
          res.data &&
          res.data.ok &&
          res.data.resumen &&
          res.data.resumen.response
        ) {
          setIaSummary(res.data.resumen.response);
        } else {
          setSummaryError("No se pudo obtener el resumen.");
        }
      })
      .catch(() => setSummaryError("Error al obtener el resumen."))
      .finally(() => setIsLoadingSummary(false));
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsSubmittingComment(true);
    
    try {
      const res = await axios.post(
        `https://red-networking-backend.vercel.app/api/projects/${id}/agregar-comentario`,
        {
          content: newComment,
          authorID: user?.id,
        }
      );
      if (res.data.ok) {
        setComments((prev) => [res.data.comentario, ...prev]);
        setNewComment("");
        setShowCommentInput(false);
      } else {
        console.error("Error al publicar el comentario");
        toast.error("Error al publicar el comentario");
      }
    } catch (err) {
      console.error("Error al publicar comentario:", err);
      toast.error("Error de conexión al publicar comentario");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!user?.id) return;
    
    try {
      const res = await axios.post(
        `https://red-networking-backend.vercel.app/api/projects/comentarios/${commentId}/like`,
        { userId: user.id }
      );
      if (res.data.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === commentId ? { ...c, likes: res.data.resultado.likes } : c
          )
        );
      } else {
        console.error("Error al actualizar like");
        toast.error("Error al actualizar like");
      }
    } catch (error) {
      console.error("Error al dar like:", error);
      toast.error("Error de conexión al dar like");
    }
  };

  const renderComment = (comment: Comment) => {
    // Usar createdAt si existe, si no, usar date
    const dateString = comment.createdAt || comment.date;
    let fechaFormateada = "Fecha no disponible";
    if (dateString) {
      const dateObj = new Date(dateString);
      if (!isNaN(dateObj.getTime())) {
        fechaFormateada = dateObj.toLocaleDateString();
      }
    }
    return (
      <div
        key={comment._id}
        className="bg-gray-800 border border-gray-700 mb-3 rounded"
      >
        <div className="flex items-center gap-2 p-3 border-b border-gray-700">
          <Avatar className="w-6 h-6">
            <AvatarImage
              src={comment.authorAvatar || "/pngs/avatar.png"}
              alt={`Avatar de ${comment.author}`}
            />
            <AvatarFallback>
              {comment.author
                ? comment.author.substring(0, 2).toUpperCase()
                : "CN"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-col">
            <span className="text-blue-400 text-xs">{commentAuthorNames[comment.authorID || comment.author] || comment.author}</span>
            <span className="text-gray-400 text-xs ml-2">
              {fechaFormateada}
            </span>
          </div>
        </div>
        <div className="p-3">
          <p className="text-white font-light text-sm mb-2">
            {comment.content}
          </p>
          <div className="flex gap-3">
            <button
              className={`flex items-center gap-1 text-xs ${
                comment.likes.includes(user?.id ?? "")
                  ? "text-red-500"
                  : "text-gray-400 hover:text-red-500"
              }`}
              onClick={() => handleLike(comment._id)}
            >
              <Heart className="w-4 h-4" />
              <span>{comment.likes.length}</span>
            </button>
            <button className="flex items-center gap-1 text-gray-400 hover:text-blue-500">
              <MessageCircleMore className="w-4 h-4" />
              <span className="text-xs">Responder</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoadingProject || !proyecto) {
    return (
      <DashboardLayout>
        <div className="w-full max-w-5xl mx-auto bg-[#232733] rounded-xl shadow-lg p-8 border border-gray-700 my-8 text-white">
          {/* Skeleton Header */}
          <div className="mb-6 border-b border-gray-700 pb-4">
            <div className="h-8 bg-gray-700 rounded animate-pulse mb-4"></div>
            <div className="h-6 bg-gray-700 rounded animate-pulse w-3/4"></div>
          </div>
          
          {/* Skeleton Content */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700">
                <div className="h-6 bg-gray-700 rounded animate-pulse mb-4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded animate-pulse w-2/3"></div>
                </div>
              </div>
              <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700">
                <div className="h-6 bg-gray-700 rounded animate-pulse mb-4"></div>
                <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
              </div>
            </div>
            
            <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700">
              <div className="h-6 bg-gray-700 rounded animate-pulse mb-4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-700 rounded animate-pulse w-3/4"></div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700">
                <div className="h-6 bg-gray-700 rounded animate-pulse mb-4"></div>
                <div className="flex flex-wrap gap-2">
                  <div className="h-6 w-16 bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-20 bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-14 bg-gray-700 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700">
                <div className="h-6 bg-gray-700 rounded animate-pulse mb-4"></div>
                <div className="flex flex-wrap gap-2">
                  <div className="h-6 w-12 bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-18 bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-10 bg-gray-700 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  // Debug: ver el valor de la fecha
  console.log("Fecha del proyecto:", proyecto.date);
  console.log("Tipo de fecha:", typeof proyecto.date);

  const avgScore =
    proyecto.puntuacion && proyecto.puntuacion.length > 0
      ? (
          proyecto.puntuacion.reduce((a, b) => a + b, 0) /
          proyecto.puntuacion.length
        ).toFixed(1)
      : "Sin puntuación";

  return (
    <DashboardLayout>
      <div className="w-full max-w-5xl mx-auto bg-[#232733] rounded-xl shadow-lg p-8 border border-gray-700 my-8 text-white">
        {/* Header principal */}
        <div className="mb-6 border-b border-gray-700 pb-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-center sm:text-left mb-2 text-white">
            Título del Proyecto:{" "}
            <span className="text-blue-400">{proyecto.title}</span>
          </h1>
            <ProjectDropDownActions projectId={id} isAuthor={isAuthor} />
        </div>

        {/* Autores y Fecha */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#181b22] rounded-lg p-4 flex flex-col gap-2 border border-gray-700 text-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold text-white">Autores:</span>
            </div>
            <ul className="flex flex-col gap-1 ml-2">
              {authorNames && authorNames.length > 0 ? (
                authorNames.map((author, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="bg-blue-900 text-blue-300 px-2 py-1 rounded-full text-sm font-medium">
                      {author}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-gray-400 text-sm">
                  Sin autores especificados
                </li>
              )}
            </ul>
          </div>
          <div className="bg-[#181b22] rounded-lg p-4 flex flex-col gap-2 border border-gray-700 text-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold text-white">
                Fecha de Publicación:
              </span>
            </div>
            <span className="text-gray-300 text-sm">
              {(() => {
                try {
                  const date = new Date(proyecto.date);
                  if (isNaN(date.getTime())) {
                    return "Fecha no válida";
                  }
                  return date.toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  });
                } catch (error) {
                  console.error("Error parsing date:", proyecto.date, error);
                  return "Fecha no válida";
                }
              })()}
            </span>
          </div>
        </div>
        {/* Descripción */}
        <div className="bg-[#181b22] rounded-lg p-4 mb-6 border border-gray-700 text-gray-200">
          <h2 className="font-semibold text-lg mb-2 text-white">
            Descripción del Proyecto:
          </h2>
          <p className="text-gray-300 text-sm whitespace-pre-line">
            {proyecto.description}
          </p>
        </div>
        {/* Tecnologías y Etiquetas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Tecnologías */}
          <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 text-gray-200">
            <h2 className="font-semibold text-lg mb-3 text-white">
              Tecnologías:
            </h2>
            <div className="flex flex-wrap gap-2">
              {proyecto.tools && proyecto.tools.length > 0 ? (
                proyecto.tools.map((tool) => (
                  <span
                    key={tool}
                    className="bg-blue-900 text-blue-300 px-3 py-1 rounded-full text-sm"
                  >
                    {tool}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-sm">
                  Sin tecnologías especificadas
                </span>
              )}
            </div>
          </div>
          {/* Etiquetas */}
          <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 text-gray-200">
            <h2 className="font-semibold text-lg mb-3 text-white">
              Etiquetas:
            </h2>
            <div className="flex flex-wrap gap-2">
              {proyecto.tags && proyecto.tags.length > 0 ? (
                proyecto.tags.map((tag, idx) => {
                  const colors = [
                    "bg-blue-900 text-blue-300",
                    "bg-green-900 text-green-300",
                    "bg-purple-900 text-purple-300",
                    "bg-pink-900 text-pink-300",
                    "bg-yellow-900 text-yellow-300",
                    "bg-red-900 text-red-300",
                    "bg-indigo-900 text-indigo-300",
                    "bg-teal-900 text-teal-300",
                    "bg-orange-900 text-orange-300",
                  ];
                  const color = colors[idx % colors.length];
                  return (
                    <span
                      key={tag}
                      className={`${color} px-3 py-1 rounded-full text-sm`}
                    >
                      {tag}
                    </span>
                  );
                }))
              : (
                <span className="text-gray-400 text-sm">Sin etiquetas</span>
              )}
            </div>
          </div>
        </div>
        {/* Recursos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 flex flex-col items-center text-gray-200">
            <span className="font-semibold mb-2 text-white">
              Código Fuente:
            </span>
            {proyecto.repositoryLink &&
            proyecto.repositoryLink.trim() !== "" ? (
              <a 
                href={proyecto.repositoryLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
              >
                <Github className="w-5 h-5" />
                <span className="text-sm">Ver en GitHub</span>
              </a>
            ) : (
              <span className="text-gray-400 text-sm">No disponible</span>
            )}
          </div>
          <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 flex flex-col items-center text-gray-200">
            <span className="font-semibold mb-2 text-white">Manual:</span>
            {proyecto.document && proyecto.document.trim() !== "" ? (
              <a 
                href={proyecto.document}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-blue-400 border border-blue-400 rounded-md hover:bg-blue-400 hover:text-white transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                Descargar
              </a>
            ) : (
              <span className="text-gray-400 text-sm">No disponible</span>
            )}
          </div>
          <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 flex flex-col items-center text-gray-200">
            <span className="font-semibold mb-2 text-white">
              Puntaje Promedio:
            </span>
            <span className="bg-blue-900 text-blue-300 px-3 py-1 rounded-full text-xs">
              {avgScore}
            </span>
          </div>
        </div>
        {/* Imágenes del sistema */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-4 text-white">
            Imágenes del Sistema
          </h3>
          <div className="flex justify-center">
            {proyecto.image && proyecto.image.trim() !== "" ? (
              <div className="max-w-2xl w-full relative">
                <Image 
                  src={proyecto.image} 
                  alt="Imagen del sistema" 
                  width={800}
                  height={600}
                  className="rounded-lg w-full h-auto max-h-96 object-contain border border-gray-700" 
                  onLoadStart={() => {
                    setImageLoading(true);
                    setImageError(false);
                  }}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageLoading(false);
                    setImageError(true);
                  }}
                />
                {imageLoading && (
                  <div className="absolute inset-0 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center z-10">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">Cargando imagen...</p>
                    </div>
                  </div>
                )}
                {imageError && (
                  <div className="absolute inset-0 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center z-10">
                    <span className="text-gray-400 text-sm">Error al cargar la imagen</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full max-w-2xl h-64 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                <span className="text-gray-400 text-sm">
                  No hay imagen disponible
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Resumen IA */}
        <div className="bg-[#1e293b] border-2 border-blue-500 rounded-lg p-4 my-6 text-gray-200 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg text-blue-400">Resumen generado por IA</h3>
            {(!iaSummary && !isLoadingSummary) && (
              <button
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={handleGenerateSummary}
                disabled={isLoadingSummary}
              >
                {isLoadingSummary ? "Generando..." : "Generar resumen IA"}
              </button>
            )}
          </div>
          {isLoadingSummary && (
            <div className="text-blue-400">Cargando resumen...</div>
          )}
          {summaryError && <div className="text-red-400">{summaryError}</div>}
          {iaSummary && (
            <div className="prose prose-invert max-w-none max-h-72 overflow-y-auto pr-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: (props) => (
                    <h1
                      className="underline decoration-blue-400 mb-2"
                      {...props}
                    />
                  ),
                  h2: (props) => (
                    <h2
                      className="underline decoration-blue-400 mb-2"
                      {...props}
                    />
                  ),
                  h3: (props) => (
                    <h3
                      className="underline decoration-blue-400 mb-2"
                      {...props}
                    />
                  ),
                  em: (props) => (
                    <em className="text-blue-300 italic" {...props} />
                  ),
                  strong: (props) => (
                    <strong className="text-blue-400 font-bold" {...props} />
                  ),
                  li: (props) => (
                    <li
                      className="mb-1 pl-2 list-disc list-inside"
                      {...props}
                    />
                  ),
                  p: (props) => <p className="mb-2" {...props} />, 
                }}
              >
                {iaSummary}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {/* Comentarios */}
        <div className="bg-[#181b22] rounded-lg p-4 border border-gray-700 mt-6 text-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg text-white">Comentarios</h3>
            {isAuthenticated && (
              <button
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={() => setShowCommentInput((prev) => !prev)}
              >
                {showCommentInput ? "Cancelar" : "Agregar comentario"}
              </button>
            )}
          </div>
          {showCommentInput && isAuthenticated && (
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
              <div className="relative w-full">
                <Textarea
                  value={newComment}
                  onChange={(e) => {
                    if (e.target.value.length <= 1000) {
                      setNewComment(e.target.value);
                    }
                  }}
                  placeholder="Escribe tu comentario..."
                  className="bg-[#1f2937] text-white border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none rounded-md p-3 h-12"
                />
                <p className="absolute bottom-1 right-4 text-xs text-gray-400">
                  {newComment.length}/1000
                </p>
              </div>
              <button
                onClick={handleAddComment}
                disabled={isSubmittingComment || newComment.trim() === ""}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full sm:w-auto"
              >
                {isSubmittingComment ? "Enviando..." : "Publicar"}
              </button>
            </div>
          )}
          {isLoadingComments && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="ml-2 text-gray-400">
                Cargando comentarios...
              </span>
            </div>
          )}
          {commentsError && (
            <div className="text-red-400 text-center p-4">{commentsError}</div>
          )}
          {!isLoadingComments && !commentsError && comments.length === 0 && (
            <div className="text-gray-200 rounded text-center p-4">
              No hay comentarios aún. ¡Sé el primero en comentar!
            </div>
          )}
          {!isLoadingComments && !commentsError && comments.length > 0 && (
            <div className="space-y-3">{comments.map(renderComment)}</div>
          )}
          {isLoadingComments && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-800 border border-gray-700 rounded p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-gray-700 rounded-full animate-pulse"></div>
                    <div className="h-4 bg-gray-700 rounded animate-pulse w-24"></div>
                    <div className="h-4 bg-gray-700 rounded animate-pulse w-16"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-700 rounded animate-pulse w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}