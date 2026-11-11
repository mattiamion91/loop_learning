import styles from './Button.module.css';

// Pulsante riutilizzabile. `variante`: "primario" (riempito) oppure "fantasma" (contorno).
export default function Button({ variante = 'primario', type = 'button', children, ...rest }) {
  return (
    <button type={type} className={styles[variante]} {...rest}>
      {children}
    </button>
  );
}
